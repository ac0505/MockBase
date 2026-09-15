import express from "express";
import bcrypt from "bcrypt";
import User from "../models/userSchema.js";

const loginRouter = express.Router();

loginRouter.get("/", async (req, res) => {
    if (req.session && req.session.userId) {
        return res.redirect("/dashboard");
    }
    res.render("login", { errorMessage: null});
});

loginRouter.post("/", async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ username });

        if (!user || !user.isActive) {
            return res.render("login", { errorMessage: "Invalid username or password" });
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash);

        if (!isMatch) {
            return res.render("login", { errorMessage: "Invalid username or password" });
        }

        req.session.userId = user._id;
        req.session.username = user.username;
        req.session.role = user.role;

        res.redirect("/dashboard");
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).send("Internal Server Error");
    }
});

export default loginRouter;