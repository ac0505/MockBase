import mongoose from "mongoose";

const academicTermSchema = new mongoose.Schema(
  {
    schoolYear: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{4}-\d{4}$/, "School year must be in YYYY-YYYY format"]
    },

    term: {
      type: String,
      required: true,
      enum: ["1st Term", "2nd Term", "3rd Term"]
    },

    isActive: {
      type: Boolean,
      default: true
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    }
  },
  { timestamps: true }
);

academicTermSchema.index({ schoolYear: 1, term: 1 }, { unique: true });
academicTermSchema.index({ isActive: 1 });

export default mongoose.model("AcademicTerm", academicTermSchema);
