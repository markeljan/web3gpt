import Image from "next/image"
import { cn } from "@/lib/utils"

const FALLBACK_AVATAR = "/assets/web3gpt.png"

type AssistantAvatarProps = {
  imageUrl?: string | null
  name?: string
  className?: string
}

export function AssistantAvatar({ imageUrl, name = "Web3GPT", className }: AssistantAvatarProps) {
  const src = imageUrl || FALLBACK_AVATAR

  return (
    <div
      className={cn(
        "bg-background relative flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full border select-none",
        className
      )}
    >
      <Image
        alt={`${name} avatar`}
        className="object-cover"
        fill
        sizes="28px"
        src={src}
        // The image optimizer rejects SVG unless `dangerouslyAllowSVG` is on;
        // some agent logos are SVG, so serve those as-is.
        unoptimized={src.toLowerCase().endsWith(".svg")}
      />
    </div>
  )
}
