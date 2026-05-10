"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { formatBytes } from "@/lib/utils";
import type { DocumentType } from "@/types";
import { DOCUMENT_TYPE_LABELS } from "@/types";
import { Upload, FileText, X, CheckCircle } from "lucide-react";
import toast from "react-hot-toast";

const DOC_TYPE_OPTIONS = Object.entries(DOCUMENT_TYPE_LABELS).map(
  ([value, label]) => ({ value, label })
);

const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

interface FileUploadProps {
  requestId?: string;
  onUploaded?: () => void;
}

export default function FileUpload({ requestId, onUploaded }: FileUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<DocumentType>("id_document");
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const supabase = createClient();

  const handleFile = (f: File) => {
    if (!ALLOWED_TYPES.includes(f.type)) {
      toast.error("Only PDF, JPG, PNG, or WebP files are allowed");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error("File must be under 10 MB");
      return;
    }
    setFile(f);
    setDone(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFile(dropped);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Not authenticated");
      setUploading(false);
      return;
    }

    const ext = file.name.split(".").pop();
    const filePath = `${user.id}/${Date.now()}_${docType}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(filePath, file, { contentType: file.type });

    if (uploadError) {
      toast.error(uploadError.message);
      setUploading(false);
      return;
    }

    const { error: dbError } = await supabase.from("documents").insert({
      client_id: user.id,
      request_id: requestId || null,
      document_type: docType,
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
      mime_type: file.type,
    });

    if (dbError) {
      toast.error(dbError.message);
      setUploading(false);
      return;
    }

    toast.success("Document uploaded successfully");
    setFile(null);
    setDone(true);
    onUploaded?.();
    setUploading(false);
  };

  return (
    <div className="space-y-4">
      <Select
        label="Document type"
        options={DOC_TYPE_OPTIONS}
        value={docType}
        onChange={(e) => setDocType(e.target.value as DocumentType)}
        required
      />

      {/* Drop zone */}
      <div
        onClick={() => fileRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-300 hover:border-[#1B2E6B] bg-gray-50 hover:bg-[#1B2E6B]/5 transition-colors cursor-pointer p-8 text-center"
      >
        <input
          ref={fileRef}
          type="file"
          className="sr-only"
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        {done ? (
          <CheckCircle className="h-10 w-10 text-green-500" />
        ) : file ? (
          <FileText className="h-10 w-10 text-[#1B2E6B]" />
        ) : (
          <Upload className="h-10 w-10 text-gray-400" />
        )}
        {file ? (
          <div>
            <p className="text-sm font-medium text-gray-800">{file.name}</p>
            <p className="text-xs text-gray-500">{formatBytes(file.size)}</p>
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium text-gray-700">
              Drop a file here or click to browse
            </p>
            <p className="text-xs text-gray-400">PDF, JPG, PNG up to 10 MB</p>
          </div>
        )}
        {file && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setFile(null);
            }}
            className="absolute top-2 right-2 rounded-full bg-white p-1 shadow text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <Button
        onClick={handleUpload}
        disabled={!file}
        loading={uploading}
        className="w-full"
      >
        Upload document
      </Button>
    </div>
  );
}
