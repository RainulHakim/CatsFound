"use client";

import { Camera, ImagePlus, LocateFixed, X } from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { CategoryIcon } from "@/components/category-icon";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { loadDraft, saveDraft } from "@/lib/client/draft";
import { resizePhoto } from "@/lib/client/resize";
import { cn } from "@/lib/cn";
import { postFoundItem, type PostState } from "./actions";

type Category = { id: string; name: string; icon: string; is_sensitive: boolean };
type Building = { id: string; name: string; lat: number; lng: number };
type Photo = { file: File; url: string };

const MAX_PHOTOS = 4;
const QUICK_CATEGORIES = 9;

function distance(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y);
}

export function PostForm({
  categories,
  buildings,
  src,
}: {
  categories: Category[];
  buildings: Building[];
  src?: string;
}) {
  const [state, action, pending] = useActionState<PostState, FormData>(postFoundItem, {});
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [category, setCategory] = useState("");
  const [building, setBuilding] = useState("");
  const [description, setDescription] = useState("");
  const [secret, setSecret] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [order, setOrder] = useState<Building[]>(buildings);
  const [locating, setLocating] = useState<"idle" | "busy" | "done" | "denied">("idle");
  const [processing, setProcessing] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const restored = useRef(false);

  // The named file input is what gets submitted; keep it in sync with our list.
  // (React resets forms after an action, so re-sync after every result too.)
  useEffect(() => {
    const input = photoInput.current;
    if (!input) return;
    const dt = new DataTransfer();
    for (const p of photos) dt.items.add(p.file);
    input.files = dt.files;
  }, [photos, state]);

  // Restore a draft once, then start the time-to-post clock.
  useEffect(() => {
    let cancelled = false;
    void loadDraft().then((d) => {
      if (cancelled) return;
      if (d) {
        setPhotos(
          d.photos.map((p) => {
            const file = new File([p.blob], p.name, { type: p.type });
            return { file, url: URL.createObjectURL(file) };
          }),
        );
        setCategory(d.category);
        setBuilding(d.building);
        setDescription(d.description);
        setSecret(d.secret);
      }
      setStartedAt(d?.startedAt ?? Date.now());
      restored.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!restored.current || startedAt === null) return;
    const t = setTimeout(() => {
      void saveDraft({
        photos: photos.map((p) => ({ name: p.file.name, type: p.file.type, blob: p.file })),
        category,
        building,
        description,
        secret,
        startedAt,
      });
    }, 300);
    return () => clearTimeout(t);
  }, [photos, category, building, description, secret, startedAt]);

  async function addPhotos(list: FileList | null) {
    if (!list || list.length === 0) return;
    setProcessing(true);
    const room = MAX_PHOTOS - photos.length;
    const resized = await Promise.all([...list].slice(0, room).map(resizePhoto));
    setPhotos((prev) =>
      [...prev, ...resized.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(
        0,
        MAX_PHOTOS,
      ),
    );
    setProcessing(false);
  }

  function removePhoto(index: number) {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index]!.url);
      return prev.filter((_, i) => i !== index);
    });
  }

  function sortByNearest() {
    if (!("geolocation" in navigator)) return setLocating("denied");
    setLocating("busy");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Used here, in the browser, only. Coordinates are never sent anywhere.
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setOrder([...buildings].sort((a, b) => distance(here, a) - distance(here, b)));
        setLocating("done");
      },
      () => setLocating("denied"),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    );
  }

  const [quick, more] = useMemo(
    () => [categories.slice(0, QUICK_CATEGORIES), categories.slice(QUICK_CATEGORIES)],
    [categories],
  );
  const selectedInMore = more.some((c) => c.id === category);
  const selectedCategory = categories.find((c) => c.id === category);
  const errors = state.errors ?? {};

  return (
    <form
      action={action}
      encType="multipart/form-data"
      className="flex flex-col gap-8 pb-28"
      noValidate
      aria-describedby={state.message ? "form-message" : undefined}
    >
      {state.message ? (
        <div id="form-message">
          <Notice tone="error">{state.message}</Notice>
        </div>
      ) : null}

      {/* 1. Photo */}
      <fieldset
        className="flex flex-col gap-3"
        aria-describedby={errors.photos ? "photos-error" : undefined}
      >
        <legend className="mb-1 text-lg font-semibold">Photo of what you found</legend>

        {photos.length > 0 ? (
          <ul className="grid grid-cols-4 gap-2" aria-label="Photos added">
            {photos.map((p, i) => (
              <li key={p.url} className="relative">
                <img
                  src={p.url}
                  alt={`Photo ${i + 1}`}
                  className="aspect-square w-full rounded-md object-cover"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="absolute -top-2 -right-2 flex size-11 items-center justify-center"
                  aria-label={`Remove photo ${i + 1}`}
                >
                  <span className="bg-text text-bg shadow-raised flex size-7 items-center justify-center rounded-full">
                    <X className="size-4" aria-hidden="true" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {photos.length < MAX_PHOTOS ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <label
              className={cn(
                "bg-primary text-on-primary hover:bg-primary-hover focus-within:outline-focus flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-md px-5 text-lg font-semibold focus-within:outline-3 focus-within:outline-offset-2",
                photos.length > 0 &&
                  "border-border-strong bg-surface text-text hover:bg-surface-2 min-h-11 border text-base",
              )}
            >
              <Camera className="size-5" aria-hidden="true" />
              {processing ? "Adding…" : photos.length === 0 ? "Take a photo" : "Take another"}
              {/* Named input = what is submitted. capture opens the camera directly. */}
              <input
                ref={photoInput}
                type="file"
                name="photos"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  const files = e.target.files;
                  void addPhotos(files);
                }}
              />
            </label>
            <label className="text-primary focus-within:outline-focus flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md px-4 underline underline-offset-4 focus-within:outline-3 focus-within:outline-offset-2">
              <ImagePlus className="size-5" aria-hidden="true" />
              Choose from library
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => {
                  void addPhotos(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        ) : (
          <p className="text-muted text-sm">That's the maximum of {MAX_PHOTOS} photos.</p>
        )}
        {errors.photos ? (
          <p id="photos-error" className="text-danger text-sm font-medium">
            {errors.photos}
          </p>
        ) : null}
      </fieldset>

      {/* 2. Category */}
      <fieldset aria-describedby={errors.category ? "category-error" : undefined}>
        <legend className="mb-3 text-lg font-semibold">What is it?</legend>
        <div className="grid grid-cols-3 gap-2">
          {quick.map((c) => (
            <CategoryTile
              key={c.id}
              category={c}
              checked={category === c.id}
              onChange={setCategory}
            />
          ))}
        </div>
        <details className="mt-3" open={selectedInMore || undefined}>
          <summary className="text-primary flex min-h-11 cursor-pointer items-center underline underline-offset-4">
            More kinds, including wallets, keys, phones and IDs
          </summary>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {more.map((c) => (
              <CategoryTile
                key={c.id}
                category={c}
                checked={category === c.id}
                onChange={setCategory}
              />
            ))}
          </div>
        </details>
        {selectedCategory?.is_sensitive ? (
          <Notice className="mt-3">
            Valuables like this are shown without a photo, and they go to the Alvarez Union desk.
          </Notice>
        ) : null}
        {errors.category ? (
          <p id="category-error" className="text-danger mt-2 text-sm font-medium">
            {errors.category}
          </p>
        ) : null}
      </fieldset>

      {/* 3. Where */}
      <div className="flex flex-col gap-2">
        <label htmlFor="building" className="text-lg font-semibold">
          Where did you find it?
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            id="building"
            name="building"
            value={building}
            onChange={(e) => setBuilding(e.target.value)}
            aria-invalid={errors.building ? true : undefined}
            aria-describedby={errors.building ? "building-error" : undefined}
            className="border-border-strong bg-surface text-text h-12 w-full rounded-md border px-3 text-base sm:flex-1"
          >
            <option value="">Choose a building</option>
            {order.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="secondary"
            onClick={sortByNearest}
            disabled={locating === "busy"}
          >
            <LocateFixed className="size-4" aria-hidden="true" />
            {locating === "busy" ? "Locating…" : "Nearest first"}
          </Button>
        </div>
        <p className="text-muted text-sm" aria-live="polite">
          {locating === "done"
            ? "Sorted by distance. Your location stays on your phone."
            : locating === "denied"
              ? "Couldn't get your location; pick from the list."
              : "Only the building is shown publicly, never an exact spot."}
        </p>
        {errors.building ? (
          <p id="building-error" className="text-danger text-sm font-medium">
            {errors.building}
          </p>
        ) : null}
      </div>

      {/* 4. Optional details */}
      <div className="flex flex-col gap-2">
        <label htmlFor="description" className="text-lg font-semibold">
          Describe it <span className="text-muted font-normal">(optional)</span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={2}
          maxLength={500}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Black North Face jacket, size M"
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? "description-error" : undefined}
          className="border-border-strong bg-surface text-text placeholder:text-muted rounded-md border px-3 py-2 text-base"
        />
        {errors.description ? (
          <p id="description-error" className="text-danger text-sm font-medium">
            {errors.description}
          </p>
        ) : null}
      </div>

      <div className="border-accent bg-surface flex flex-col gap-2 rounded-lg border p-4">
        <label htmlFor="secret" className="text-lg font-semibold">
          Anything only the owner would know?{" "}
          <span className="text-muted font-normal">(optional)</span>
        </label>
        <p id="secret-hint" className="text-muted text-sm">
          A scratch, sticker or engraving. We keep it hidden and use it to check the real owner.
        </p>
        <input
          id="secret"
          name="secret"
          type="text"
          maxLength={200}
          autoComplete="off"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="e.g. small dent by the left earbud"
          aria-invalid={errors.secret ? true : undefined}
          aria-describedby={errors.secret ? "secret-hint secret-error" : "secret-hint"}
          className="border-border-strong bg-surface text-text placeholder:text-muted h-12 rounded-md border px-3 text-base"
        />
        {errors.secret ? (
          <p id="secret-error" className="text-danger text-sm font-medium">
            {errors.secret}
          </p>
        ) : null}
      </div>

      {/* Bots fill every field; people never see this one. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Leave this empty</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>
      <input type="hidden" name="startedAt" value={startedAt ?? ""} />
      {src ? <input type="hidden" name="src" value={src} /> : null}

      {/* Thumb-reachable submit, pinned to the bottom on phones. */}
      <div className="border-border bg-bg/95 fixed inset-x-0 bottom-0 z-10 border-t px-4 py-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0">
        <Button type="submit" size="lg" block disabled={pending || processing}>
          {pending ? "Posting…" : "Post found item"}
        </Button>
      </div>
    </form>
  );
}

function CategoryTile({
  category,
  checked,
  onChange,
}: {
  category: Category;
  checked: boolean;
  onChange: (id: string) => void;
}) {
  return (
    <label
      className={cn(
        "bg-surface focus-within:outline-focus flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border p-2 text-center text-sm leading-tight focus-within:outline-3 focus-within:outline-offset-2",
        checked
          ? "border-primary bg-surface-2 ring-primary font-semibold ring-2"
          : "border-border-strong",
      )}
    >
      <input
        type="radio"
        name="category"
        value={category.id}
        checked={checked}
        onChange={() => onChange(category.id)}
        className="sr-only"
      />
      <CategoryIcon name={category.icon} className="size-6" />
      {category.name}
    </label>
  );
}
