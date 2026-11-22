const playwright = require("playwright");
const fs = require("node:fs"),
  path = require("node:path");
module.exports = {
  ...playwright,
  _electron: {
    async launch(options) {
      const app = await playwright._electron.launch(options);
      const file = path.join(
        process.env.PIXERIN_TEST_RUN,
        "pixerin-test-run.json",
      );
      const metadata = JSON.parse(fs.readFileSync(file, "utf8"));
      metadata.electronPids = [
        ...(metadata.electronPids || []),
        app.process().pid,
        await app.evaluate(() => process.pid),
      ];
      metadata.electronVersion = await app.evaluate(() => process.versions.electron);
      fs.writeFileSync(file, JSON.stringify(metadata, null, 2));
      await app.evaluate(({ app, BrowserWindow }) => {
        globalThis.pixerinTestFocus = [];
        const attach = (window) => {
          for (const type of ["focus", "blur"])
            window.on(type, () => {
              globalThis.pixerinTestFocus.push({
                type,
                host: window.id,
                at: Date.now(),
              });
              if (globalThis.pixerinTestFocus.length > 12)
                globalThis.pixerinTestFocus.shift();
            });
        };
        BrowserWindow.getAllWindows().forEach(attach);
        app.on("browser-window-created", (_event, window) => attach(window));
      });
      const close = app.close.bind(app);
      app.close = async () => {
        const events = await app
          .evaluate(() => globalThis.pixerinTestFocus)
          .catch(() => []);
        if (events.some((event) => event.type === "blur"))
          console.log(
            "Native focus history (diagnostic only; does not prove input interference):",
            JSON.stringify(events),
          );
        let timer;
        try {
          const finished = await Promise.race([
            close().then(()=>true),
            new Promise(resolve=>{timer=setTimeout(()=>resolve(false),30000);}),
          ]);
          if(!finished) {
            // A failed test can leave an import dialog open, so normal app
            // shutdown is deliberately refused. Do not hide its assertion
            // behind an indefinitely pending finally block.
            console.error("Isolated test shutdown did not finish in 30s; forcing only this test application's exit.");
            process.exitCode=1;
            await app.evaluate(({app})=>app.exit(0)).catch(()=>{});
          }
        } finally {clearTimeout(timer);}
      };
      return app;
    },
  },
};
