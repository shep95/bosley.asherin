import { useReveal } from "@/hooks/useReveal";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const faqs = [
  {
    q: "is this free?",
    a: "yes. free to join. no credit card. asher@bosley.app if something is broken.",
  },
  {
    q: "are messages unreadable on your servers?",
    a: "we do not claim that. https in transit. we do not claim unreadable on our servers.",
  },
  {
    q: "is there an algorithm?",
    a: "the feed is chronological by default. no ads. no engagement farming.",
  },
  {
    q: "can i leave?",
    a: "export and delete anytime.",
  },
  {
    q: "who runs this?",
    a: "asher newton. zorak corp. founded sept 5, 2024. support asher@bosley.app.",
  },
];

const FAQSection = () => {
  const ref = useReveal<HTMLElement>();
  return (
    <section ref={ref} className="py-24 sm:py-32 px-4 sm:px-6 lg:px-8 relative">
      <div className="max-w-3xl mx-auto">
        <div className="reveal text-center mb-16">
          <p className="text-foreground/60 text-xs font-light tracking-[0.2em] uppercase mb-4">questions</p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extralight text-foreground">answered plainly</h2>
        </div>

        <div className="reveal glass rounded-2xl overflow-hidden" style={{ "--reveal-delay": "80ms" } as React.CSSProperties}>
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`} className="border-border/10 px-6 sm:px-8">
                <AccordionTrigger className="text-foreground font-light text-sm sm:text-base text-left hover:no-underline py-5">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-foreground/70 font-light text-sm leading-relaxed pb-5">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
};

export default FAQSection;
