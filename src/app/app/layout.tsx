import { AppShell } from "@/components/penny/app-shell";
import { GlobalShortcuts } from "@/components/penny/global-shortcuts";
import { NewMapDialogProvider } from "@/components/penny/new-map-modal";
import { QuickCaptureModalProvider } from "@/components/penny/quick-capture-modal";
import { getCurrentUser } from "@/lib/auth";

export default async function AppLayout({
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
          <AppShell userId={userId} userEmail={userEmail}>
            {children}
          </AppShell>
          <GlobalShortcuts />
        </div>
      </QuickCaptureModalProvider>
    </NewMapDialogProvider>
  );
}
