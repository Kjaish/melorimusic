import { Heart, Headphones, Music } from "lucide-react";

export function MissionSection() {
  return (
    <section
      id="mission"
      className="py-20 px-6 bg-card/50"
      data-testid="section-mission"
    >
      <div className="max-w-4xl mx-auto">
        <h2 className="font-display text-3xl sm:text-4xl font-bold text-center mb-12 text-foreground">
          Our Mission
        </h2>
        
        <div className="space-y-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-6">
            <Headphones className="h-6 w-6 text-primary" />
            <Music className="h-6 w-6 text-primary" />
            <Heart className="h-6 w-6 text-primary" />
          </div>
          
          <p className="text-lg text-muted-foreground leading-relaxed">
            At Melori, we believe music should be free to enjoy—and free to create. 
            Stream every album on us, because great art shouldn't have barriers.
          </p>
          
          <p className="text-lg text-muted-foreground leading-relaxed">
            But here's what makes us different: While other platforms treat music as 
            content to be aggregated and monetized, Melori treats each artist as a 
            business to be empowered. We're not just another streaming service—we're 
            the operating system for the modern independent creative.
          </p>
          
          <p className="text-lg text-muted-foreground leading-relaxed">
            Love streaming our albums? For those who'd like to go a step further, 
            purchasing directly on Melori supports our team of creators the most. 
            It directly fuels our next project and helps us keep the creativity coming. 
            Thank you for being part of this!
          </p>
          
          <p className="text-lg text-muted-foreground leading-relaxed">
            Every purchase bypasses the industry middlemen, sending your support 
            exactly where it belongs: straight into the hands that made the music. 
            Your choice to buy isn't just a transaction—it's direct investment in 
            an artist's next chapter.
          </p>
          
          <p className="text-xl font-heading font-semibold text-primary mt-10">
            Stream freely. Support directly. Create endlessly.
          </p>
        </div>
      </div>
    </section>
  );
}
