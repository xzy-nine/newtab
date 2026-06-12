import { X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { getNextZIndex } from "@/lib/dialog-z-index";
import { useState } from "react";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

function DialogOverlay({
  className,
  style,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  const [zIndex] = useState(() => getNextZIndex());

  return (
    <DialogPrimitive.Overlay
      className={cn(
        "fixed inset-0 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className,
      )}
      data-slot="dialog-overlay"
      style={{ zIndex, ...style }}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  style,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  const [overlayZ] = useState(() => getNextZIndex());
  const contentZ = overlayZ + 1;

  return (
    <DialogPortal>
      <DialogOverlay style={{ zIndex: overlayZ }} />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-[50%] top-[50%] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg",
          className,
        )}
        data-slot="dialog-content"
        style={{ zIndex: contentZ, ...style }}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
      {...props}
    />
  );
}

const DialogTitle = DialogPrimitive.Title;

const DialogDescription = DialogPrimitive.Description;

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
};
