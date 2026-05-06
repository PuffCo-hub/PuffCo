import { useState } from "react";
import { Shell, StickyFooter, Disclaimer } from "@/components/Shell";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { CheckCircle2 } from "lucide-react";

const CATEGORIES = [
  "Vapes",
  "Carts",
  "Glass",
  "Papers",
  "Wraps",
  "Accessories",
  "Other",
];

export default function Request() {
  const [text, setText] = useState("");
  const [category, setCategory] = useState<string>("");
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  async function submit() {
    if (!text.trim()) return;
    try {
      await apiRequest("POST", "/api/requests", {
        text: text.trim(),
        category: category || null,
      });
      setSubmitted(true);
      toast({ title: "Got it.", description: "We'll add it if it trends." });
    } catch (e) {
      toast({
        title: "Couldn't submit",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  }

  return (
    <Shell title="Write-in request" back="/menu">
      {!submitted ? (
        <>
          <p className="text-sm text-muted-foreground mb-5">
            Tell us what you'd like to make a regular purchase. Be specific —
            brand, type, size, or flavor. No personal info, please.
          </p>

          <div className="space-y-4">
            <div>
              <Label htmlFor="req-text" className="text-xs uppercase tracking-wider text-muted-foreground">
                Product
              </Label>
              <Textarea
                id="req-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder='e.g. "Geek Bar Pulse — sour apple" or "small blue bubbler"'
                className="bg-card border-card-border min-h-28 mt-1"
                data-testid="input-request-text"
              />
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Category (optional)
              </Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger
                  className="mt-1 bg-card border-card-border"
                  data-testid="select-category"
                >
                  <SelectValue placeholder="Pick a category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Disclaimer />
        </>
      ) : (
        <div className="flex flex-col items-center text-center mt-12">
          <CheckCircle2 className="size-12 text-primary mb-3" />
          <h2 className="text-lg font-semibold mb-1">Request received</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            Trending requests get added to the menu. Thanks for telling us
            what you want.
          </p>
        </div>
      )}

      <StickyFooter>
        {!submitted ? (
          <Button
            disabled={!text.trim()}
            onClick={submit}
            className="ember-button w-full h-12 font-semibold"
            data-testid="button-submit-request"
          >
            Submit request
          </Button>
        ) : (
          <Button
            onClick={() => navigate("/menu")}
            className="ember-button w-full h-12 font-semibold"
            data-testid="button-back-menu"
          >
            Back to menu
          </Button>
        )}
      </StickyFooter>
    </Shell>
  );
}
