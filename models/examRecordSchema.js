import mongoose from "mongoose";

const rosterEntrySchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true
    },
    result: {
      type: String,
      enum: {
        values: ["P", "C"],
        message: "Result must be P (Pass) or C (Continuing)"
      },
      default: null
    },

    recorded: {
      type: Boolean,
      default: false
    },

    status: {
      type: String,
      enum: {
        values: ["P", "C", "Passed", "Continuing", "Failed", "Pending"],
        message: "Status must be one of P, C, Passed, Continuing, Failed, or Pending"
      },
      default: "Pending"
    },

    // Admin or proctor who entered the result
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    recordedAt: {
      type: Date,
      default: null
    },

    remarks: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ""
    }
  },
  { _id: false }
);

const examRecordSchema = new mongoose.Schema(
  {
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true
    },
    term: {
      type: String,
      enum: ["1st Term", "2nd Term", "3rd Term"],
      required: true
    },
    schoolYear: {
      type: String,
      required: true,
      match: /^\d{4}-\d{4}$/
    },
    roster: {
      type: [rosterEntrySchema],
      required: true,
      validate: {
        validator(entries) {
          if (entries.some((entry) => !entry.student)) return false;
          const studentIds = entries.map((entry) => entry.student.toString());
          return new Set(studentIds).size === studentIds.length;
        },
        message: "Roster cannot contain missing or duplicate students"
      }
    }
  },
  { timestamps: true }
);

examRecordSchema.index(
  { course: 1, term: 1, schoolYear: 1 },
  { unique: true }
);
examRecordSchema.index({ "roster.student": 1 });

export default mongoose.model("ExamRecord", examRecordSchema);
