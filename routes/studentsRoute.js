import express from "express";

const studentsRouter = express.Router();

studentsRouter.get("/", (req, res) => {
    res.render("students");
})

export default studentsRouter;