import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge, { statusVariantMap } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";
import type { ServiceRequest } from "@/types";
import { SERVICE_TYPE_LABELS, REQUEST_STATUS_LABELS } from "@/types";
import { MapPin, ArrowRight } from "lucide-react";

interface RequestCardProps {
  request: ServiceRequest;
}

export default function RequestCard({ request }: RequestCardProps) {
  return (
    <Card padding="none" className="hover:shadow-md transition-shadow">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-semibold text-[#1B2E6B] text-sm">
              {SERVICE_TYPE_LABELS[request.service_type]}
            </p>
            <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate max-w-xs">{request.property_address}</span>
            </div>
          </div>
          <Badge
            label={REQUEST_STATUS_LABELS[request.status]}
            variant={statusVariantMap[request.status]}
          />
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            Submitted {formatDate(request.created_at)}
          </span>
          <Link
            href={`/dashboard/requests/${request.id}`}
            className="flex items-center gap-1 text-xs font-medium text-[#E8521A] hover:underline"
          >
            View details <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </Card>
  );
}
