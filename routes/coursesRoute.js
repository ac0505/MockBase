import express from "express";

const coursesRouter = express.Router();

coursesRouter.get("/", async (req, res) => {
    res.render("courses");  
});

export default coursesRouter;