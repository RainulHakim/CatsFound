import type { Metadata } from "next";
import { listBuildings, listCategories } from "@/lib/items";
import { PostForm } from "./post-form";

export const metadata: Metadata = {
  title: "Post a found item",
  description: "Found something on Davidson's campus? Snap a photo and post it. No account needed.",
  alternates: { canonical: "/found/new" },
};

export default async function NewFoundItemPage({ searchParams }: PageProps<"/found/new">) {
  const [categories, buildings, params] = await Promise.all([
    listCategories(),
    listBuildings(),
    searchParams,
  ]);
  const src =
    typeof params.src === "string" && /^[a-z0-9-]{1,32}$/.test(params.src) ? params.src : undefined;

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">You found something</h1>
        <p className="text-muted">
          Thanks! A photo and where you found it is all we need. No account.
        </p>
      </div>
      <PostForm
        categories={categories.map(({ id, name, icon, is_sensitive }) => ({
          id,
          name,
          icon,
          is_sensitive,
        }))}
        buildings={buildings}
        src={src}
      />
    </section>
  );
}
