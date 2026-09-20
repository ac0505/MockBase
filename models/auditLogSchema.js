import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: [
        "CREATE_USER",
        "UPDATE_USER",
        "DELETE_USER",
        "RESET_PASSWORD",
        "CREATE_COURSE",
        "DELETE_COURSE",
        "BULK_IMPORT",
        "UPDATE_STATUS",
        "UPDATE_RESULT",
        "UNLOCK_RECORD",
        "LOCK_RECORD",
        "MERGE_STUDENTS",
        "DELETE_STUDENT",
        "CREATE_TERM_CONFIG",
        "UPDATE_TERM_CONFIG",
        "DELETE_TERM_CONFIG",
        "EXPORT_DATA",
        "ADD_TO_ROSTER",
        "REMOVE_FROM_ROSTER"
      ]
    },

    targetType: {
      type: String,
      required: true,
      enum: ["User", "Course", "ExamRecord", "Student", "AcademicTerm", "System"]
    },

    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },

    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    details: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: ""
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ performedBy: 1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ targetType: 1, targetId: 1 });

export default mongoose.model("AuditLog", auditLogSchema);
