const mongoose = require("mongoose");

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

    surname: {
      type: String,
      required: true,
      trim: true
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

module.exports = mongoose.model("Student", studentSchema);