import { runSiteExample } from './site-scenario.js';

function resultTable(label, result) {
  const items = result.items;
  const wrapper = document.createElement('div');
  wrapper.className = 'table-wrap';
  const table = document.createElement('table');
  const caption = table.createCaption();
  caption.textContent = label;
  const header = table.createTHead().insertRow();
  for (const label of ['Title', 'Selected by', 'Similarity', 'Score']) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = label;
    header.append(cell);
  }
  const body = table.createTBody();
  for (const item of items) {
    const row = body.insertRow();
    for (const value of [item.title, item.profile, item.sim?.toFixed(3) ?? 'Fallback', item.score.toFixed(3)]) {
      row.insertCell().textContent = value;
    }
  }
  const why = document.createElement('p');
  why.textContent = result.why.length ? `Why: ${result.why.join(', ')}` : 'Why: no profile match to explain.';
  wrapper.append(table, why);
  return wrapper;
}

async function render() {
  const button = document.querySelector('#run');
  const status = document.querySelector('#status');
  button.disabled = true;
  try {
    const response = await fetch('../test/fixtures/site-config.json');
    if (!response.ok) throw new Error(`Configuration request failed: ${response.status}`);
    const result = await runSiteExample(window.ConvivialPersonalisation.default, await response.json());
    document.querySelector('#results').replaceChildren(
      resultTable('Fast profile', result.fast),
      resultTable('Slow profile', result.slow),
      resultTable('Requested slots: two fast, one slow', result.mixed),
    );
    document.querySelector('#snapshot').textContent = JSON.stringify(result.engine.snapshot(), null, 2);
    status.textContent = `Library ${result.engine.version}: 44 pipelines collected; compare the cat candidate’s similarity in the two profiles.`;
  } catch (error) {
    status.textContent = `The example could not run: ${error.message}`;
  } finally {
    button.disabled = false;
  }
}

document.querySelector('#run').addEventListener('click', render);
render();
