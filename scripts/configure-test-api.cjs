// Call only after installing a fetch mock. Does not read a real key/profile.
module.exports = async (page) => {
  await page.evaluate(async () => {
    await window.pixeltool.saveSettings({ provider: "api", model: "gpt-6-astra", key: "sk-isolated-workflow-fixture", remember: false });
    await window.pixeltool.acknowledgeAI(1);
  });
  await page.waitForFunction(() => document.querySelector("#model-label").textContent.startsWith("OpenAI API"));
};
