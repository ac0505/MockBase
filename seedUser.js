import mongoose from "mongoose";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import User from "./models/userSchema.js"; // Adjust path if your schema is located elsewhere

dotenv.config();

async function seedUsers() {
    try {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            throw new Error("MONGODB_URI is missing. Add it to the .env file.");
        }
        await mongoose.connect(mongoUri);
        console.log("Connected to MongoDB...");

        const users = [
            {
                firstName: "John",
                lastName: "Doe",
                email: "proctor1@example.com",
                username: "proctor1",
                password: "password123",
                role: "proctor",
                department: "CPE Department"
            },
            {
                firstName: "System",
                lastName: "Administrator",
                email: "admin@example.com",
                username: "admin",
                password: "admin123",
                role: "admin",
                department: "Office of the Registrar"
            }
        ];

        for (const user of users) {
            const passwordHash = await bcrypt.hash(user.password, 10);
            await User.findOneAndUpdate(
                { username: user.username },
                {
                    $set: {
                        firstName: user.firstName,
                        lastName: user.lastName,
                        email: user.email,
                        passwordHash,
                        role: user.role,
                        isActive: true,
                        department: user.department
                    }
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            console.log(`Seeded ${user.username} (${user.role}).`);
        }

        console.log("User seeding complete.");
    } catch (error) {
        console.error("Error seeding users:", error);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}

seedUsers();
