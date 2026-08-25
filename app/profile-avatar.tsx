"use client";

import { useState } from "react";
import { findProfileAvatar, profileAvatarUrl } from "../lib/profile-avatars";

export default function ProfileAvatar({
  avatarId,
  name,
  className = "profile-avatar-image",
  loading = "eager",
}: {
  avatarId?: string | null;
  name: string;
  className?: string;
  loading?: "eager" | "lazy";
}) {
  const [failedId, setFailedId] = useState<string | null>(null);
  const avatar = findProfileAvatar(avatarId);
  const src = profileAvatarUrl(avatarId);
  const failed = Boolean(avatarId && failedId === avatarId);

  return (
    <span className={className} aria-label={avatar ? `${name}, avatar ${avatar.name}` : name}>
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading={loading}
          style={{ objectFit: "cover" }}
          onError={() => setFailedId(avatarId || null)}
        />
      ) : <b aria-hidden="true">{name.trim().slice(0, 1).toUpperCase() || "?"}</b>}
    </span>
  );
}
