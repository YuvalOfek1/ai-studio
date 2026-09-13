import "../src/lib/load-env";
import { PrismaClient } from "@prisma/client";

/** Gives a fresh install something to click on. */
const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.project.count();
  if (existing > 0) {
    console.log(`[seed] ${existing} project(s) already exist — nothing to do.`);
    return;
  }

  const project = await prisma.project.create({
    data: {
      name: "First project",
      description: "Sample workspace — try the mock provider before adding any API keys.",
    },
  });

  const promptNode = {
    id: "n-prompt",
    position: { x: 40, y: 120 },
    data: { kind: "text", label: "Prompt", text: "A neon-lit street at night, slow dolly forward, cinematic" },
  };
  const imageNode = {
    id: "n-image",
    position: { x: 340, y: 80 },
    data: { kind: "generate", label: "Create image", capability: "image.generate", providerId: "mock", modelId: "mock-image", params: {} },
  };
  const videoNode = {
    id: "n-video",
    position: { x: 660, y: 120 },
    data: { kind: "generate", label: "Image to video", capability: "video.image2video", providerId: "mock", modelId: "mock-i2v", params: {} },
  };
  const outputNode = { id: "n-out", position: { x: 980, y: 160 }, data: { kind: "output", label: "Final clip" } };

  await prisma.workflow.create({
    data: {
      projectId: project.id,
      name: "Prompt → image → video",
      description: "The shape of most shots: one prompt drives a still, the still drives the clip.",
      graph: {
        nodes: [promptNode, imageNode, videoNode, outputNode],
        edges: [
          { id: "e1", source: "n-prompt", target: "n-image", sourceHandle: "output", targetHandle: "prompt" },
          { id: "e2", source: "n-prompt", target: "n-video", sourceHandle: "output", targetHandle: "prompt" },
          { id: "e3", source: "n-image", target: "n-video", sourceHandle: "output", targetHandle: "image" },
          { id: "e4", source: "n-video", target: "n-out", sourceHandle: "output", targetHandle: "input" },
        ],
      },
    },
  });

  console.log(`[seed] created project "${project.name}" with a sample flow.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
