import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSession } from "#/lib/auth-client";
import { AppSidebar } from "#/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "#/components/ui/sidebar";
import { Separator } from "#/components/ui/separator";
import { cn } from "#/lib/utils";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "#/components/ui/breadcrumb";

export function AuthGuard({
  title,
  actions,
  children,
  fillHeight,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Page manages its own height/scrolling (e.g. dashboard) instead of the page growing naturally. */
  fillHeight?: boolean;
}) {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isPending && !session) {
      navigate({ to: "/login" });
    }
  }, [isPending, session, navigate]);

  if (isPending) {
    return <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!session) return null;

  return (
    // SidebarProvider's own wrapper is `min-h-svh` (a floor, not a cap) — fine for pages that grow
    // naturally, but a fillHeight page needs a real ceiling or its flex-1/min-h-0 chain has nothing
    // to clip against and the whole page grows instead of scrolling internally. Pin it to `h-svh`
    // (+ overflow-hidden) only for fillHeight pages.
    <SidebarProvider className={cn(fillHeight && "h-svh overflow-hidden")}>
      <AppSidebar />
      <SidebarInset className={cn(fillHeight && "min-h-0 overflow-hidden")}>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>{title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </header>
        <div className={cn("flex flex-1 flex-col gap-4 p-4 md:p-6", fillHeight && "min-h-0 overflow-hidden")}>
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
