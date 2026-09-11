import express from "express";

const dashboardRouter = express.Router();

dashboardRouter.get("/", async (req, res) => {
    res.render("dashboard");
});

export default dashboardRouter;