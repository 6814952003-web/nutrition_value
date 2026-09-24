const Track = require("../models/track.model");
const getTracks = async (req, res, next) => {
    try {
        const tracks = await Track.find();
        res.json(tracks);
    } catch (error) {
        next(error);
    }
};
const createTrack = async (req, res, next) => {
    try {
        const track = await Track.create(req.body);
        res.status(201).json(track);
    } catch (error) {
        next(error);
    }
};
const downloadTrack = async (req, res, next) => {
    try {
        const track = await Track.findByIdAndUpdate(
            req.params.id,
            { $inc: { downloads: 1 } },
            { new: true }
        );
        if (!track) {
            return res.status(404).json({ message: "Track not found" });
        }
        res.json({ title: track.title, downloads: track.downloads });
    } catch (error) {
        next(error);
    }
};

module.exports = { getTracks, createTrack, downloadTrack };