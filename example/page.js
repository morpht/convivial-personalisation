import { runExample } from './scenario.js';

async function render() {
  const button = document.querySelector('#run');
  const status = document.querySelector('#status');
  button.disabled = true;
  try {
    const { engine, ranked } = await runExample(window.ConvivialPersonalisation.default);
    const table = document.querySelector('#results');
    table.replaceChildren();
    for (const item of ranked) {
      const row = document.createElement('tr');
      for (const value of [item.title, item.profile, item.sim?.toFixed(3) ?? 'Fallback', item.score.toFixed(3), item.why.join(', ')]) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      table.append(row);
    }
    document.querySelector('#snapshot').textContent = JSON.stringify(engine.snapshot(), null, 2);
    status.textContent = `Library ${engine.version}: ${ranked.length} results. Fast and slow can merge after learning the same page.`;
  } catch (error) {
    status.textContent = `The example could not run: ${error.message}`;
  } finally {
    button.disabled = false;
  }
}

document.querySelector('#run').addEventListener('click', render);
render();
