import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true
    },

    lastName: {
      type: String,
      required: true,
      trim: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    username: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },

    passwordHash: {
      type: String,
      required: true
    },

    role: {
      type: String,
      enum: ["admin", "proctor"],
      default: "proctor"
    },

    isActive: {
      type: Boolean,
      default: true
    },

    department: {
      type: String,
      trim: true,
      default: ""
    }
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);