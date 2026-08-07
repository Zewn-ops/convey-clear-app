import Card from "@/components/ui/Card";
import { GraduationCap, Video } from "lucide-react";
import { videosFor, vimeoEmbedUrl, type TrainingAudience } from "@/lib/training-videos";

/**
 * The training tab (Meeting 2, 2026-08-06).
 *
 * One component, three mount points — /admin/training, /partner/training and
 * /dashboard/training — so each portal keeps its own shell and nav rather than
 * this living in a fourth, chromeless layout.
 *
 * Embeds are lazy and sandboxed to what a video player actually needs. The CSP
 * allows player.vimeo.com in frame-src; without that entry these render blank,
 * which is the failure mode to check first if they ever stop working.
 */
export default function TrainingVideos({ audience }: { audience: TrainingAudience }) {
  const videos = videosFor(audience);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">
          Training videos
        </h1>
        <p className="text-sm text-ink-3 mt-1">
          Short walkthroughs of the things people ask about most.
        </p>
      </div>

      {videos.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <GraduationCap className="h-8 w-8 mx-auto text-ink-3" />
            <p className="text-sm text-ink-2 mt-3">No videos yet.</p>
            <p className="text-xs text-ink-3 mt-1 max-w-sm mx-auto">
              Tutorials are being recorded and will appear here.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {videos.map((v) => (
            <Card key={v.slug} className="space-y-3">
              <div className="relative w-full overflow-hidden rounded-lg bg-raised" style={{ paddingTop: "56.25%" }}>
                <iframe
                  src={vimeoEmbedUrl(v)}
                  title={v.title}
                  loading="lazy"
                  allow="fullscreen; picture-in-picture"
                  referrerPolicy="strict-origin-when-cross-origin"
                  className="absolute inset-0 h-full w-full border-0"
                />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink flex items-center gap-1.5">
                  <Video className="h-3.5 w-3.5 text-action shrink-0" />
                  {v.title}
                  {v.duration && (
                    <span className="text-xs font-normal text-ink-3">· {v.duration}</span>
                  )}
                </p>
                <p className="text-xs text-ink-3 mt-1">{v.description}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
