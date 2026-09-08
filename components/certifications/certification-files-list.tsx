import type { ReactNode } from "react";
import { ExternalLink, FileImage, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatFileSize, isImageMime } from "@/lib/utils/files";
import type { CertificationFileWithUrl } from "@/lib/types";

/** Presentational only — safe in both Server and Client Components. `action` lets
 * `CertificationFiles` add its delete button without duplicating the row markup. */
export function CertificationFileRow({
  file,
  action,
}: {
  file: CertificationFileWithUrl;
  action?: ReactNode;
}) {
  const Icon = isImageMime(file.mime_type) ? FileImage : FileText;

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border p-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium truncate">{file.original_name}</span>
        <span className="text-xs text-muted-foreground shrink-0">
          {formatFileSize(file.size_bytes)}
        </span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {file.signed_url ? (
          <Button variant="ghost" size="icon" aria-label="פתיחת הקובץ" asChild>
            <a href={file.signed_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4" />
            </a>
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">הקישור אינו זמין</span>
        )}
        {action}
      </div>
    </div>
  );
}
