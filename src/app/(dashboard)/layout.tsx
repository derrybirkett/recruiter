import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppBreadcrumb } from "@/components/app-breadcrumb";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider defaultOpen={false}>
      <AppSidebar />
      <SidebarInset className="flex flex-col min-h-screen">
        <header className="flex h-12 items-center gap-2 px-4 shrink-0">
          <SidebarTrigger className="-ml-1" />
          <AppBreadcrumb />
        </header>
        <div className="flex-1 flex flex-col min-h-0">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
