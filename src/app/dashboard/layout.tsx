import { Nav } from "@/components/penny/nav";
import { GlobalShortcuts } from "@/components/penny/global-shortcuts";
import { NewMapDialogProvider } from "@/components/penny/new-map-modal";
import { QuickCaptureModalProvider } from "@/components/penny/quick-capture-modal";
import { getCurrentUser } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  const userId = user?.id ?? "";
  const userEmail = user?.email ?? "Signed in";

  return (
    <NewMapDialogProvider>
      <QuickCaptureModalProvider>
        <div className="min-h-screen" data-user-id={userId}>
          <div className="mx-auto max-w-7xl px-6 py-8 lg:px-10">
            <Nav userId={userId} userEmail={userEmail} />
            <div className="py-8">{children}</div>
          </div>
          <GlobalShortcuts />
        </div>
      </QuickCaptureModalProvider>
    </NewMapDialogProvider>
  );
}
