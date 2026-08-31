import { Link } from "@tanstack/react-router";
import { Button } from "#/components/ui/button";
import { signOut, useSession } from "#/lib/auth-client";

export function Nav() {
  const { data: session } = useSession();
  if (!session) return null;

  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <nav className="flex items-center gap-4 text-sm font-medium">
          <span className="font-semibold">Reconciliation</span>
          <Link to="/upload" className="text-muted-foreground hover:text-foreground [&.active]:text-foreground">
            Upload
          </Link>
          <Link to="/dashboard" className="text-muted-foreground hover:text-foreground [&.active]:text-foreground">
            Dashboard
          </Link>
          <Link to="/discrepancies" className="text-muted-foreground hover:text-foreground [&.active]:text-foreground">
            Discrepancies
          </Link>
        </nav>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{session.user.email}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              signOut({
                fetchOptions: {
                  onSuccess: () => {
                    window.location.href = "/login";
                  },
                },
              })
            }
          >
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
