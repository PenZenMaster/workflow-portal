import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CATEGORIES } from "@shared/schema";
import type { InsertWorkflow, Workflow } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Workflow | null;
};

type FormValues = {
  name: string;
  category: string;
  description: string;
  inputsText: string;
  tagsText: string;
  prompt: string;
  launchUrl: string;
  launchLabel: string;
  pinned: boolean;
};

// The form keeps inputs/tags as raw text and we split on submit.
const localSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string().min(1, "Category is required"),
  description: z.string().min(1, "Description is required"),
  inputsText: z.string().default(""),
  tagsText: z.string().default(""),
  prompt: z.string().default(""),
  launchUrl: z.string().default(""),
  launchLabel: z.string().default(""),
  pinned: z.boolean().default(false),
});

export function WorkflowDialog({ open, onOpenChange, editing }: Props) {
  const { toast } = useToast();
  const form = useForm<FormValues>({
    resolver: zodResolver(localSchema),
    defaultValues: {
      name: "",
      category: "Audit",
      description: "",
      inputsText: "",
      tagsText: "",
      prompt: "",
      launchUrl: "",
      launchLabel: "",
      pinned: false,
    },
  });

  useEffect(() => {
    if (open) {
      if (editing) {
        form.reset({
          name: editing.name,
          category: editing.category,
          description: editing.description,
          inputsText: editing.inputs.join("\n"),
          tagsText: editing.tags.join(", "),
          prompt: editing.prompt,
          launchUrl: editing.launchUrl,
          launchLabel: editing.launchLabel,
          pinned: editing.pinned,
        });
      } else {
        form.reset({
          name: "",
          category: "Audit",
          description: "",
          inputsText: "",
          tagsText: "",
          prompt: "",
          launchUrl: "",
          launchLabel: "",
          pinned: false,
        });
      }
    }
  }, [open, editing, form]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload: InsertWorkflow = {
        name: values.name.trim(),
        category: values.category,
        description: values.description.trim(),
        inputs: values.inputsText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        tags: values.tagsText
          .split(",")
          .map((s) => s.trim().replace(/^#/, ""))
          .filter(Boolean),
        prompt: values.prompt,
        launchUrl: values.launchUrl.trim(),
        launchLabel: values.launchLabel.trim(),
        pinned: values.pinned,
      };
      if (editing) {
        return apiRequest("PUT", `/api/workflows/${editing.id}`, payload);
      }
      return apiRequest("POST", "/api/workflows", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      toast({
        title: editing ? "Workflow updated" : "Workflow added",
        description: form.getValues("name"),
      });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Please try again.",
      });
    },
  });

  const onSubmit = (values: FormValues) => {
    mutation.mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit workflow" : "New workflow"}
          </DialogTitle>
          <DialogDescription>
            Catalog a reusable agency workflow with description, inputs, and a copyable prompt.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            data-testid="form-workflow"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. SEO Site Audit (full skill)"
                      {...field}
                      data-testid="input-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-category">
                          <SelectValue placeholder="Pick a category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pinned"
                render={({ field }) => (
                  <FormItem className="flex flex-col gap-2">
                    <FormLabel>Pin to top</FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-2 h-10">
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-pinned"
                        />
                        <span className="text-sm text-muted-foreground">
                          {field.value ? "Pinned" : "Not pinned"}
                        </span>
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Short description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="What this workflow does and when to use it."
                      rows={3}
                      {...field}
                      data-testid="input-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="inputsText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Required inputs</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={"One per line, e.g.\nWebsite URL\nGBP link\nBusiness type"}
                      rows={4}
                      {...field}
                      data-testid="input-inputs"
                    />
                  </FormControl>
                  <FormDescription>One input per line.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="prompt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Copyable prompt</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="The prompt the user will copy and paste into Perplexity / Claude / etc."
                      rows={6}
                      className="font-mono text-xs"
                      {...field}
                      data-testid="input-prompt"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="launchUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Launch URL (optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://www.perplexity.ai/"
                        {...field}
                        data-testid="input-launch-url"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="launchLabel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Launch button label</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Launch in Perplexity"
                        {...field}
                        data-testid="input-launch-label"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="tagsText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tags</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="seo, audit, schema"
                      {...field}
                      data-testid="input-tags"
                    />
                  </FormControl>
                  <FormDescription>Comma-separated.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={mutation.isPending}
                data-testid="button-save"
              >
                {mutation.isPending ? "Saving..." : editing ? "Save changes" : "Add workflow"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
