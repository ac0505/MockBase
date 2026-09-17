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

    identityKey: {
      type: String,
      unique: true,
      sparse: true,
      select: false
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

studentSchema.pre("validate", function setIdentityKey(next) {
  this.identityKey = [this.surname, this.firstName, this.middleName]
    .map((value) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase())
    .join("|");
  next();
});

export default mongoose.model("Student", studentSchema);