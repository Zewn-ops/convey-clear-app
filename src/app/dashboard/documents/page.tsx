import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Card from "@/components/ui/Card";
import FileUpload from "@/components/dashboard/FileUpload";
import { formatDate, formatBytes } from "@/lib/utils";
import { DOCUMENT_TYPE_LABELS } from "@/types";
import { FileText, FolderOpen } from "lucide-react";

export const metadata = { title: "My Documents — ConveyClear" };

export default async function DocumentsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: documents } = await supabase
    .from("documents")
    .select("*")
    .eq("client_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1B2E6B]">My Documents</h1>
        <p className="text-sm text-gray-500 mt-1">
          Securely stored documents. Files are only accessible to you and
          authorised ConveyClear staff.
        </p>
      </div>

      <Card>
        <h2 className="font-semibold text-gray-900 mb-4">Upload new document</h2>
        <FileUpload />
      </Card>

      <div>
        <h2 className="font-semibold text-gray-900 mb-3">Uploaded Documents</h2>
        {documents && documents.length > 0 ? (
          <Card padding="none">
            <ul className="divide-y divide-gray-100">
              {documents.map((doc) => (
                <li key={doc.id} className="flex items-center gap-4 px-5 py-4">
                  <div className="rounded-lg bg-[#1B2E6B]/10 p-2.5 shrink-0">
                    <FileText className="h-4 w-4 text-[#1B2E6B]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {doc.file_name}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {DOCUMENT_TYPE_LABELS[doc.document_type as keyof typeof DOCUMENT_TYPE_LABELS]}
                      {doc.file_size ? ` · ${formatBytes(doc.file_size)}` : ""}
                      {" · "}
                      {formatDate(doc.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FolderOpen className="h-14 w-14 text-gray-200 mb-4" />
            <p className="text-sm text-gray-500">No documents uploaded yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
