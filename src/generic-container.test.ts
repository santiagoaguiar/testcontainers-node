import fetch from "node-fetch";
import path from "path";
import { createServer, Server } from "http";
import { GenericContainer } from "./generic-container";
import { AlwaysPullPolicy } from "./pull-policy";
import { Wait } from "./wait";
import { Readable } from "stream";
import { RandomUuid } from "./uuid";
import { TestContainers } from "./test-containers";
import { RandomPortClient } from "./port-client";
import { getContainerById, getEvents, getRunningContainerNames } from "./test-helper";

describe("GenericContainer", () => {
  jest.setTimeout(180_000);

  const fixtures = path.resolve(__dirname, "..", "fixtures", "docker");

  it("should wait for port", async () => {
    const container = await new GenericContainer("cristianrgreco/testcontainer:1.1.12").withExposedPorts(8080).start();

    const url = `http://${container.getHost()}:${container.getMappedPort(8080)}`;
    const response = await fetch(`${url}/hello-world`);

    expect(response.status).toBe(200);
    await container.stop();
  });

  it("should wait for log", async () => {
    const container = await new GenericContainer("cristianrgreco/testcontainer:1.1.12")
      .withExposedPorts(8080)
      .withWaitStrategy(Wait.forLogMessage("Listening on port 8080"))
      .start();

    const url = `http://${container.getHost()}:${container.getMappedPort(8080)}`;
    const response = await fetch(`${url}/hello-world`);

    expect(response.status).toBe(200);
    await container.stop();
  });

  it("should wait for log with regex", async () => {
    const container = await new GenericContainer("cristianrgreco/testcontainer:1.1.12")
      .withExposedPorts(8080)
      .withWaitStrategy(Wait.forLogMessage(/Listening on port [0-9]+/))
      .start();

    const url = `http://${container.getHost()}:${container.getMappedPort(8080)}`;
    const response = await fetch(`${url}/hello-world`);

    expect(response.status).toBe(200);
    await container.stop();
  });

  it("should wait for health check", async () => {
    const context = path.resolve(fixtures, "docker-with-health-check");
    const customGenericContainer = await GenericContainer.fromDockerfile(context).build();
    const container = await customGenericContainer
      .withExposedPorts(8080)
      .withWaitStrategy(Wait.forHealthCheck())
      .start();

    const url = `http://${container.getHost()}:${container.getMappedPort(8080)}`;
    const response = await fetch(`${url}/hello-world`);

    expect(response.status).toBe(200);
    await container.stop();
  });

  it("should wait for custom health check", async () => {
    const container = await new GenericContainer("cristianrgreco/testcontainer:1.1.12")
      .withExposedPorts(8080)
      .withHealthCheck({
        test: "curl -f http://localhost:8080/hello-world || exit 1",
        interval: 1000,
        timeout: 3000,
        retries: 5,
        startPeriod: 1000,
      })
      .withWaitStrategy(Wait.forHealthCheck())
      .start();

    const url = `http://${container.getHost()}:${container.getMappedPort(8080)}`;
    const response = await fetch(`${url}/hello-world`);

    expect(response.status).toBe(200);
    await container.stop();
  });

  it("should set network mode", async () => {
    const container = await new GenericContainer("cristianrgreco/testcontainer:1.1.12").withNetworkMode("host").start();
    const dockerContainer = getContainerById(container.getId());

    const containerInfo = await dockerContainer.inspect();

    expect(containerInfo.HostConfig.NetworkMode).toBe("host");
    await container.stop();
  });

  it("should set environment variables", async () => {
    const container = await new GenericContainer("cristianrgreco/testcontainer:1.1.12")
      .withEnv("customKey", "customValue")
      .withExposedPorts(8080)
      .start();

    const url = `http://${container.getHost()}:${container.getMappedPort(8080)}`;
    const response = await fetch(`${url}/env`);
    const responseBody = await response.json();

    expect(responseBody.customKey).toBe("customValue");
    await container.stop();
  });

  it("should set command", async () => {
    const container = await new GenericContainer("cristianrgreco/testcontainer:1.1.12")
      .withCmd(["node", "index.js", "one", "two", "three"])
      .withExposedPorts(8080)
      .start();

    const url = `http://${container.getHost()}:${container.getMappedPort(8080)}`;
    const response = await fetch(`${url}/cmd`);
    const responseBody = await response.json();

    expect(responseBody).toEqual(["/usr/local/bin/node", "/index.js", "one", "two", "three"]);
    await container.stop();
  });

  it("should set name", async () => {
    const containerName = "special-test-container";
    const expectedContainerName = "/special-test-container";

    const container = await new GenericContainer("cristianrgreco/testcontainer:1.1.12").withName(containerName).start();

    expect(container.getName()).toEqual(expectedContainerName);
    await container.stop();
  });

  it("should set bind mounts", async () => {
    const filename = "test.txt";
    const source = path.resolve(fixtures, "docker", filename);
    const target = `/tmp/${filename}`;

    const container = await new GenericContainer("cristianrgreco/testcontainer:1.1.12")
      .withBindMount(source, target)
      .withExposedPorts(8080)
      .start();

    const { output } = await container.exec(["cat", target]);
    expect(output).toContain("hello world");

    await container.stop();
  });

  it("should set tmpfs", async () => {
    const container = await new GenericContainer("cristianrgreco/testcontainer:1.1.12")
      .withTmpFs({ "/testtmpfs": "rw" })
      .withExposedPorts(8080)
      .start();

    const tmpFsFile = "/testtmpfs/test.file";

    const { exitCode: exitCode1 } = await container.exec(["ls", tmpFsFile]);
    expect(exitCode1).toBe(1);

    await container.exec(["touch", tmpFsFile]);
    const { exitCode: exitCode2 } = await container.exec(["ls", tmpFsFile]);
    expect(exitCode2).toBe(0);

    await container.stop();
  });

  it("should set default log driver", async () => {
    const container = await new GenericContainer("cristianrgreco/testcontainer:1.1.12").withDefaultLogDriver().start();
    const dockerContainer = getContainerById(container.getId());

    const containerInfo = await dockerContainer.inspect();

    expect(containerInfo.HostConfig.LogConfig).toEqual({
      Type: "json-file",
      Config: {},
    });
    await container.stop();
  });

  it("should set privileged mode", async () => {
    const container = await new GenericContainer("cristianrgreco/testcontainer:1.1.12")
      .withPrivilegedMode()
      .withExposedPorts(8080)
      .start();
    const dockerContainer = getContainerById(container.getId());
    const containerInfo = await dockerContainer.inspect();
    expect(containerInfo.HostConfig.Privileged).toBe(true);

    const url = `http://${container.getHost()}:${container.getMappedPort(8080)}`;
    const response = await fetch(`${url}/hello-world`);
    expect(response.status).toBe(200);

    await container.stop();
  });

  it("should use pull policy", async () => {
    const container1 = await new GenericContainer("cristianrgreco/testcontainer:1.1.12").withExposedPorts(8080).start();

    const events = await getEvents();

    const container2 = await new GenericContainer("cristianrgreco/testcontainer:1.1.12")
      .withPullPolicy(new AlwaysPullPolicy())
      .withExposedPorts(8080)
      .start();

    const statuses = await new Promise((resolve) => {
      const eventStatuses: string[] = [];
      events.on("data", (data) => {
        const status = JSON.parse(data).status;
        eventStatuses.push(status);
        if (status === "create") {
          resolve(eventStatuses);
        }
      });
    });

    expect(statuses).toContain("pull");

    events.destroy();
    await container1.stop();
    await container2.stop();
  });

  it("should execute a command on a running container", async () => {
    const container = await new GenericContainer("cristianrgreco/testcontainer:1.1.12").withExposedPorts(8080).start();

    const { output, exitCode } = await container.exec(["echo", "hello", "world"]);

    expect(exitCode).toBe(0);
    expect(output).toContain("hello world");

    await container.stop();
  });

  it("should stream logs from a running container", async () => {
    const container = await new GenericContainer("cristianrgreco/testcontainer:1.1.12").withExposedPorts(8080).start();

    const stream = await container.logs();
    const log = await new Promise((resolve) => stream.on("data", (line) => resolve(line)));

    expect(log).toContain("Listening on port 8080");
    await container.stop();
  });

  it("should set the IPC mode", async () => {
    const container = await new GenericContainer("cristianrgreco/testcontainer:1.1.12")
      .withIpcMode("host")
      .withExposedPorts(8080)
      .start();

    const url = `http://${container.getHost()}:${container.getMappedPort(8080)}`;
    const response = await fetch(`${url}/hello-world`);

    expect(response.status).toBe(200);
    await container.stop();
  });

  it("should stop the container when the host port check wait strategy times out", async () => {
    const containerName = `container-${new RandomUuid().nextUuid()}`;

    await expect(
      new GenericContainer("cristianrgreco/testcontainer:1.1.12")
        .withName(containerName)
        .withExposedPorts(8081)
        .withStartupTimeout(0)
        .start()
    ).rejects.toThrowError("Port 8081 not bound after 0ms");

    expect(await getRunningContainerNames()).not.toContain(containerName);
  });

  it("should stop the container when the log message wait strategy times out", async () => {
    const containerName = `container-${new RandomUuid().nextUuid()}`;

    await expect(
      new GenericContainer("cristianrgreco/testcontainer:1.1.12")
        .withName(containerName)
        .withExposedPorts(8080)
        .withWaitStrategy(Wait.forLogMessage("unexpected"))
        .withStartupTimeout(0)
        .start()
    ).rejects.toThrowError(`Log message "unexpected" not received after 0ms`);

    expect(await getRunningContainerNames()).not.toContain(containerName);
  });

  it("should stop the container when the health check wait strategy times out", async () => {
    const containerName = `container-${new RandomUuid().nextUuid()}`;

    const context = path.resolve(fixtures, "docker-with-health-check");
    const customGenericContainer = await GenericContainer.fromDockerfile(context).build();
    await expect(
      customGenericContainer
        .withName(containerName)
        .withExposedPorts(8080)
        .withWaitStrategy(Wait.forHealthCheck())
        .withStartupTimeout(0)
        .start()
    ).rejects.toThrowError("Health check not healthy after 0ms");

    expect(await getRunningContainerNames()).not.toContain(containerName);
  });

  it("should stop the container when the health check fails", async () => {
    const containerName = `container-${new RandomUuid().nextUuid()}`;

    const context = path.resolve(fixtures, "docker-with-health-check");
    const customGenericContainer = await GenericContainer.fromDockerfile(context).build();
    await expect(
      customGenericContainer
        .withName(containerName)
        .withExposedPorts(8080)
        .withHealthCheck({ test: "exit 1" })
        .withWaitStrategy(Wait.forHealthCheck())
        .start()
    ).rejects.toThrowError("Health check failed");

    expect(await getRunningContainerNames()).not.toContain(containerName);
  });

  it("should honour .dockerignore file", async () => {
    const context = path.resolve(fixtures, "docker-with-dockerignore");
    const container = await GenericContainer.fromDockerfile(context).build();
    const startedContainer = await container.withExposedPorts(8080).start();

    const { output } = await startedContainer.exec(["find"]);

    expect(output).toContain("exist1.txt");
    expect(output).toContain("exist2.txt");
    expect(output).not.toContain("example1.txt");
    expect(output).not.toContain("example2.txt");
    expect(output).not.toContain("example3.txt");
    expect(output).not.toContain("example4.txt");
    expect(output).not.toContain("example5.txt");
    expect(output).not.toContain("example6.txt");

    await startedContainer.stop();
  });

  it("should expose host ports to the container", async () => {
    const randomPort = await new RandomPortClient().getPort();
    const server: Server = await new Promise((resolve) => {
      const server = createServer((req, res) => {
        res.writeHead(200);
        res.end("hello world");
      });
      server.listen(randomPort, () => resolve(server));
    });

    await TestContainers.exposeHostPorts(randomPort);

    const container = await new GenericContainer("cristianrgreco/testcontainer:1.1.12").withCmd(["top"]).start();

    const { output } = await container.exec(["curl", `http://host.testcontainers.internal:${randomPort}`]);
    expect(output).toBe("hello world");

    await server.close();
    await container.stop();
  });

  it("should copy file to container", async () => {
    const source = path.resolve(fixtures, "docker", "test.txt");
    const target = "/tmp/test.txt";
    const container = await new GenericContainer("cristianrgreco/testcontainer:1.1.12")
      .withCopyFileToContainer(source, target)
      .withExposedPorts(8080)
      .start();
    const { output } = await container.exec(["cat", target]);

    expect(output).toBe("hello world");
    await container.stop();
  });

  it("should copy content to container", async () => {
    const content = "hello world";
    const target = "/tmp/test.txt";
    const container = await new GenericContainer("cristianrgreco/testcontainer:1.1.12")
      .withCopyContentToContainer(content, target)
      .withExposedPorts(8080)
      .start();
    const { output } = await container.exec(["cat", target]);

    expect(output).toBe(content);
    await container.stop();
  });

  describe("from Dockerfile", () => {
    it("should build and start", async () => {
      const context = path.resolve(fixtures, "docker");
      const container = await GenericContainer.fromDockerfile(context).build();
      const startedContainer = await container.withExposedPorts(8080).start();

      const url = `http://${startedContainer.getHost()}:${startedContainer.getMappedPort(8080)}`;
      const response = await fetch(`${url}/hello-world`);

      expect(response.status).toBe(200);
      await startedContainer.stop();
    });

    it("should build and start with custom file name", async () => {
      const context = path.resolve(fixtures, "docker-with-custom-filename");
      const container = await GenericContainer.fromDockerfile(context, "Dockerfile-A").build();
      const startedContainer = await container.withExposedPorts(8080).start();

      const url = `http://${startedContainer.getHost()}:${startedContainer.getMappedPort(8080)}`;
      const response = await fetch(`${url}/hello-world`);

      expect(response.status).toBe(200);
      await startedContainer.stop();
    });

    it("should set build arguments", async () => {
      const context = path.resolve(fixtures, "docker-with-buildargs");
      const container = await GenericContainer.fromDockerfile(context).withBuildArg("VERSION", "10-alpine").build();
      const startedContainer = await container.withExposedPorts(8080).start();

      const url = `http://${startedContainer.getHost()}:${startedContainer.getMappedPort(8080)}`;
      const response = await fetch(`${url}/hello-world`);

      expect(response.status).toBe(200);
      await startedContainer.stop();
    });

    it("should exit immediately and stop without exception", async () => {
      const message = "This container will exit immediately.";
      const context = path.resolve(fixtures, "docker-exit-immediately");
      const container = await GenericContainer.fromDockerfile(context).build();
      const startedContainer = await container.withWaitStrategy(Wait.forLogMessage(message)).start();

      await new Promise((res) => setTimeout(res, 1000));

      await startedContainer.stop();
    });
  });
});
