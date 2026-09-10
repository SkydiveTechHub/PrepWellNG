import { Nav } from "@/components/landing/nav";
import { Footer } from "@/components/landing/footer";

/**
 * Chrome for every publicly indexable page. The `landing` class is not
 * decorative — it sets --landing-bg and --landing-ink, so dropping it leaves
 * the content pages unstyled.
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="landing min-h-screen">
      <Nav />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
