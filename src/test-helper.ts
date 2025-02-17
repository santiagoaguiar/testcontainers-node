import Dockerode from "dockerode";
import { Readable } from "stream";

export const dockerode = new Dockerode();

export const getContainerById = (id: string): Dockerode.Container => dockerode.getContainer(id);

export const getEvents = async (): Promise<Readable> => {
  const events = (await dockerode.getEvents()) as Readable;
  events.setEncoding("utf-8");
  return events;
};

export const getRunningContainerNames = async (): Promise<string[]> => {
  const containers = await dockerode.listContainers();
  return containers
    .map((container) => container.Names)
    .reduce((result, containerNames) => [...result, ...containerNames], [])
    .map((containerName) => containerName.replace("/", ""));
};

export const getRunningContainerIds = async (): Promise<string[]> => {
  const containers = await dockerode.listContainers();
  return containers.map((container) => container.Id);
};

export const getRunningNetworkIds = async (): Promise<string[]> => {
  const networks = await dockerode.listNetworks();
  return networks.map((network) => network.Id);
};

export const getImagesRepoTags = async (): Promise<string[]> => {
  const images = await dockerode.listImages();
  return images.map((image) => image.RepoTags[0]);
};

export const getVolumeNames = async (): Promise<string[]> => {
  const { Volumes: volumes } = await dockerode.listVolumes();
  return volumes.map((volume) => volume.Name);
};
