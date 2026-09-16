import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

export default async function connect() {
    const database = process.env.MONGODB_URI;

    if (!database) {
        throw new Error("MONGODB_URI is missing. Add it to the .env file.");
    }

    await mongoose.connect(database);
    console.log("Connected to database");
}