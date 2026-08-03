"use client";

import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, Crop, FileText, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { checkUpload, type UploadCheck } from "@/lib/video-validation";
import { SUPPORTED_ASPECT_RATIOS, type AspectRatioDef } from "@/lib/aspect-ratio";

type Probe = { width: number; height: number; duration: number; url: string };
type Rejection = Extract<UploadCheck, { ok: false }>;

type Card = "rotate" | "crop" | "guidelines" | null;

function OptionCard({
  icon: Icon,
  title,
  subtitle,
  expanded,
  onToggle,
  children,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  expanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card/40">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-card/60 transition-colors"
      >
        <span className="w-9 h-9 rounded-full bg-bg flex items-center justify-center shrink-0">
          <Icon size={16} className="text-primary" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold">{title}</span>
          <span className="block text-xs text-text-secondary">{subtitle}</span>
        </span>
        <ChevronDown
          size={16}
          className={cn("text-text-secondary transition-transform", expanded && "rotate-180")}
        />
      </button>
      {expanded && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

export function UploadRejection({
  probe,
  rejection,
  onAcceptRotate,
  onAcceptCrop,
  onReset,
}: {
  probe: Probe;
  rejection: Rejection;
  onAcceptRotate: (width: number, height: number) => void;
  onAcceptCrop: (target: AspectRatioDef) => void;
  onReset: () => void;
}) {
  const [openCard, setOpenCard] = useState<Card>(null);
  const [selectedCrop, setSelectedCrop] = useState<AspectRatioDef | null>(null);

  const rotatedWidth = probe.height;
  const rotatedHeight = probe.width;
  const rotatedCheck = checkUpload(rotatedWidth, rotatedHeight);

  const isPortrait = rejection.reason === "not-landscape";

  return (
    <div className="max-w-lg mx-auto px-6 py-10">
      <div className="flex flex-col items-center text-center gap-3 mb-8">
        <span className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center">
          <AlertTriangle size={24} className="text-primary" />
        </span>
        <h1 className="text-xl font-bold">
          {isPortrait ? "FRAME is landscape-only" : "This ratio isn't supported yet"}
        </h1>
        <p className="text-sm text-text-secondary max-w-sm">
          {isPortrait
            ? "FRAME exists to celebrate cinematic, widescreen storytelling — every upload has to be landscape."
            : "FRAME supports a specific set of landscape ratios so every video stays true to the creator's composition."}
        </p>
        <div className="flex items-center gap-3 text-xs text-text-secondary bg-card border border-border rounded-full px-4 py-2 mt-1">
          <span>
            {probe.width}×{probe.height}
          </span>
          <span className="w-1 h-1 rounded-full bg-border" />
          <span>{rejection.ratio.toFixed(2)}:1</span>
          <span className="w-1 h-1 rounded-full bg-border" />
          <span>{isPortrait ? "Portrait" : "Landscape"}</span>
        </div>
        {!isPortrait && rejection.nearest && (
          <p className="text-xs text-text-secondary">
            Closest supported ratio:{" "}
            <span className="text-accent font-medium">{rejection.nearest.label}</span> (
            {rejection.nearest.examples[0]})
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {isPortrait && (
          <OptionCard
            icon={RotateCw}
            title="Rotate 90°"
            subtitle="Fixes the common case of a landscape clip exported with portrait rotation metadata"
            expanded={openCard === "rotate"}
            onToggle={() => setOpenCard(openCard === "rotate" ? null : "rotate")}
          >
            <div className="flex flex-col items-center gap-3">
              <div className="relative w-40 h-64 mx-auto overflow-hidden rounded-xl bg-bg border border-border">
                <video
                  src={probe.url}
                  muted
                  className="absolute top-1/2 left-1/2 origin-center object-contain"
                  style={{
                    width: 256,
                    height: 160,
                    transform: "translate(-50%, -50%) rotate(90deg)",
                  }}
                />
              </div>
              {rotatedCheck.ok ? (
                <>
                  <p className="text-xs text-primary font-medium flex items-center gap-1.5">
                    <Check size={13} /> Rotated, this is {rotatedCheck.aspect.label}
                  </p>
                  <button
                    onClick={() => onAcceptRotate(rotatedWidth, rotatedHeight)}
                    className="w-full py-2.5 rounded-full bg-primary text-bg text-sm font-semibold"
                  >
                    Continue with rotated video
                  </button>
                </>
              ) : (
                <p className="text-xs text-text-secondary text-center">
                  Rotating doesn&apos;t fix this one — {rotatedWidth}×{rotatedHeight} still isn&apos;t a
                  supported ratio.
                </p>
              )}
            </div>
          </OptionCard>
        )}

        <OptionCard
          icon={Crop}
          title="Crop to a supported ratio"
          subtitle="Preview a centered crop — nothing is applied until you confirm"
          expanded={openCard === "crop"}
          onToggle={() => setOpenCard(openCard === "crop" ? null : "crop")}
        >
          <div className="flex flex-col gap-3">
            <div className="flex gap-3 justify-center flex-wrap">
              {SUPPORTED_ASPECT_RATIOS.map((target) => (
                <button
                  key={target.id}
                  onClick={() => setSelectedCrop(target)}
                  className={cn(
                    "rounded-lg overflow-hidden border-2 transition-colors",
                    selectedCrop?.id === target.id ? "border-primary" : "border-border"
                  )}
                >
                  <div
                    className="bg-card h-16 overflow-hidden"
                    style={{ aspectRatio: (target.minRatio + target.maxRatio) / 2 }}
                  >
                    <video
                      src={`${probe.url}#t=0.1`}
                      muted
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-cover pointer-events-none"
                    />
                  </div>
                  <p className="text-[10px] font-medium text-center py-1 bg-card">
                    {target.label}
                  </p>
                </button>
              ))}
            </div>
            {selectedCrop && (
              <button
                onClick={() => onAcceptCrop(selectedCrop)}
                className="w-full py-2.5 rounded-full bg-primary text-bg text-sm font-semibold"
              >
                Continue cropped to {selectedCrop.label}
              </button>
            )}
          </div>
        </OptionCard>

        <OptionCard
          icon={FileText}
          title="Re-export using our guidelines"
          subtitle="See every supported ratio and example resolutions"
          expanded={openCard === "guidelines"}
          onToggle={() => setOpenCard(openCard === "guidelines" ? null : "guidelines")}
        >
          <ul className="flex flex-col gap-2 mb-4">
            {SUPPORTED_ASPECT_RATIOS.map((r) => (
              <li key={r.id} className="flex items-center justify-between text-xs">
                <span className="font-medium">{r.label}</span>
                <span className="text-text-secondary">{r.examples.join(" · ")}</span>
              </li>
            ))}
          </ul>
          <button
            onClick={onReset}
            className="w-full py-2.5 rounded-full border border-border text-sm font-medium hover:bg-card transition-colors"
          >
            Choose a different file
          </button>
        </OptionCard>
      </div>
    </div>
  );
}
