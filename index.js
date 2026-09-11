import express from "express";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

// Route Imports
import dashboardRouter from "./routes/dashboardRoute.js";
import coursesRouter from "./routes/coursesRoute.js";
import studentsRouter from "./routes/studentsRoute.js";

// Re-create __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse incoming request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize session
app.use(
    session({
        secret: process.env.SESSION_SECRET || "default_secret_key",
        resave: false,
        saveUninitialized: true,
        cookie: {
            secure: false,
            maxAge: 1000 * 60 * 60, // 1 hour
        }
    })
);

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files
app.use(express.static('public'));
app.use('/scripts', express.static(path.join(__dirname, 'scripts')));

// Routes
app.use("/dashboard", dashboardRouter);
app.use("/students", studentsRouter);
app.use("/courses", coursesRouter);

// Default route
app.get("/", (req, res) => {
    res.redirect("/dashboard");
});

const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/exam-grade-tracker";

try {
    await mongoose.connect(mongoUri);
    app.listen(port, () => {
        console.log(`Exit Exam Tracker running at http://localhost:${port}`);
    });
} catch (error) {
    console.error("Unable to connect to MongoDB:", error.message);
    process.exitCode = 1;
}
