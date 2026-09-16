import mongoose from "mongoose";

const studentSchema = new mongoose.Schema(
  {
    studentId: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },

    firstName: {
      type: String,
      required: true,
      trim: true
    },

    middleName: {
      type: String,
      trim: true,
      default: ""
    },

    middleInitial: {
      type: String,
      trim: true,
      uppercase: true,
      default: ""
    },

    surname: {
      type: String,
      required: true,
      trim: true
    },

    section: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },

    program: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    }
  },
  { timestamps: true }
);

export default mongoose.model("Student", studentSchema);