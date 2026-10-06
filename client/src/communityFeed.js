export const COMMUNITY_POLL_INTERVAL = 2000;

export function canDeleteCommunityItem(item, user) {
  if (!user) return false;
  if (user.role === "admin") return true;
  const author = item?.author;
  const authorId = author && typeof author === "object" ? author._id || author.id : author;
  const userId = user.id || user._id;
  return !!authorId && !!userId && String(authorId) === String(userId);
}

// One polling request at a time. Successful local writes invalidate any older
// response and update the snapshot immediately, without touching input state.
export function createCommunityFeed({
  fetchPosts,
  onSnapshot = () => {},
  onError = () => {},
  getVisibility = () => true,
  getOnline = () => true,
  scheduler = { setTimeout: (callback, delay) => setTimeout(callback, delay), clearTimeout: timer => clearTimeout(timer) },
  interval = COMMUNITY_POLL_INTERVAL,
}) {
  let running = false;
  let generation = 0;
  let inFlight = null;
  let timer = null;
  let queued = false;
  let posts = [];
  let loaded = false;
  let offline = false;
  const removedPosts = new Set();
  const removedComments = new Map();
  const visible = () => { const value = getVisibility(); return value !== false && value !== "hidden"; };
  const cleanPost = post => {
    const removed = removedComments.get(String(post._id));
    return removed && Array.isArray(post.comments) ? { ...post, comments: post.comments.filter(comment => !removed.has(String(comment._id))) } : post;
  };
  const snapshot = () => ({ posts: [...posts], loaded, loading: !loaded && !!inFlight, offline });
  const emit = () => { if (running) onSnapshot(snapshot()); };
  const clearTimer = () => { if (timer !== null) scheduler.clearTimeout(timer); timer = null; };
  const schedule = delay => {
    clearTimer();
    if (running && visible()) timer = scheduler.setTimeout(() => { timer = null; refresh(); }, delay);
  };
  function refresh() {
    if (!running) return Promise.resolve();
    clearTimer();
    if (!visible()) return Promise.resolve();
    if (inFlight) { queued = true; return inFlight.promise; }
    if (!getOnline()) { offline = true; emit(); schedule(interval); return Promise.resolve(); }
    const request = { controller: new AbortController(), generation, promise: null };
    inFlight = request;
    emit();
    request.promise = Promise.resolve().then(() => fetchPosts({ signal: request.controller.signal })).then(result => {
      if (!running || request.generation !== generation) return;
      if (!Array.isArray(result)) throw new Error("ข้อมูลโพสต์ไม่ถูกต้อง");
      const seen = new Set();
      posts = result.filter(post => post && post._id && !removedPosts.has(String(post._id)) && !seen.has(String(post._id)) && seen.add(String(post._id))).map(cleanPost);
      loaded = true; offline = false;
    }).catch(error => {
      if (!running || request.generation !== generation || error?.name === "AbortError") return;
      offline = true; onError(error);
    }).finally(() => {
      if (inFlight === request) inFlight = null;
      if (!running) return;
      const immediately = queued || request.generation !== generation;
      queued = false; emit(); schedule(immediately ? 0 : interval);
    });
    return request.promise;
  }
  const changed = () => {
    generation += 1; loaded = true; emit();
    // Wait for the old request to settle before beginning a fresh one.
    if (inFlight) queued = true;
    else schedule(0);
  };
  function upsertPost(post) {
    if (!running || !post?._id || removedPosts.has(String(post._id))) return;
    const updated = cleanPost(post);
    const index = posts.findIndex(item => String(item._id) === String(updated._id));
    if (index === -1) posts = [updated, ...posts];
    else posts = posts.map((item, position) => position === index ? updated : item);
    changed();
  }
  function removePost(id) {
    if (!running) return;
    removedPosts.add(String(id));
    posts = posts.filter(post => String(post._id) !== String(id));
    changed();
  }
  function removeComment(postId, commentId, updatedPost) {
    if (!running) return;
    const key = String(postId);
    const removed = removedComments.get(key) || new Set();
    removed.add(String(commentId)); removedComments.set(key, removed);
    if (updatedPost?._id) upsertPost(updatedPost);
    else { posts = posts.map(post => String(post._id) === key ? cleanPost(post) : post); changed(); }
  }
  return {
    start() { if (!running) { running = true; refresh(); } },
    stop() { running = false; generation += 1; queued = false; clearTimer(); inFlight?.controller.abort(); },
    refresh, upsertPost, removePost, removeComment,
    getSnapshot: snapshot,
  };
}
