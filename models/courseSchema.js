const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema(
  {
    courseCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },

    courseName: {
      type: String,
      required: true,
      trim: true
    },

    // A course code identifies exactly one section.
    section: {
      type: String,
      required: true,
      trim: true,
    },

    proctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    }
    
  },
  { timestamps: true }
);

courseSchema.index({ courseCode: 1 }, { unique: true });

module.exports = mongoose.model("Course", courseSchema);
