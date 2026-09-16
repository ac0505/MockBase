import express from "express";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "./database/mongo-dbconnect.js";

dotenv.config();

// Route Imports
import loginRouter from "./routes/loginRoute.js";
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
app.use("/login", loginRouter);
app.use("/dashboard", dashboardRouter);
app.use("/students", studentsRouter);
app.use("/courses", coursesRouter);

// Default route
app.get("/", (req, res) => {
    res.redirect("/login");
});

try {
    await connectDB();
    const server = app.listen(port, () => {
        console.log(`Exit Exam Tracker running at http://localhost:${port}`);
    });

    server.on("error", (error) => {
        if (error.code === "EADDRINUSE") {
            console.error(`Port ${port} is already in use. Stop the existing server or set a different PORT in .env.`);
            process.exitCode = 1;
            return;
        }
        console.error("Unable to start the server:", error.message);
        process.exitCode = 1;
    });

    const shutdown = async (signal) => {
        console.log(`\nReceived ${signal}. Shutting down...`);
        server.close(async () => {
            await mongoose.connection.close();
            console.log("Server stopped.");
            process.exit(0);
        });
    };

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
} catch (error) {
    console.error("Unable to connect to MongoDB:", error.message);
    process.exitCode = 1;
}
