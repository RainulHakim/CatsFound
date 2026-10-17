import Link from "next/link";

export default function NotFound() {
  return (
    <section className="flex flex-col gap-4 py-8">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p>
        <Link href="/">Go to the home page</Link>
      </p>
    </section>
  );
}
