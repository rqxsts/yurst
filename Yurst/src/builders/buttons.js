export class ButtonsBuilder {
  #rows = [];
  #currentRow;
  #lastButton;

  row() {
    this.#currentRow = [];
    this.#rows.push(this.#currentRow);
    this.#lastButton = undefined;
    return this;
  }

  callback(text, data) {
    return this.add({ text, data });
  }

  btn(text, data) {
    return this.callback(text, data);
  }

  link(text, url) {
    return this.add({ text, url });
  }

  app(text, value = '') {
    return this.add({ text, app: value });
  }

  command(text, command) {
    return this.add({ text, command });
  }

  cmd(text, command) {
    return this.command(text, command);
  }

  copy(text, value) {
    return this.add({ text, copy: value });
  }

  add(button) {
    if (!this.#currentRow) {
      throw new Error('Call row() before adding a button');
    }
    if (!button || typeof button.text !== 'string') {
      throw new TypeError('A button must have a string text property');
    }

    this.#lastButton = { ...button };
    this.#currentRow.push(this.#lastButton);
    return this;
  }

  style(style) {
    if (!this.#lastButton) throw new Error('Add a button before setting its style');
    this.#lastButton.style = style;
    return this;
  }

  primary() {
    return this.style('primary');
  }

  success() {
    return this.style('success');
  }

  danger() {
    return this.style('danger');
  }

  gray() {
    if (!this.#lastButton) throw new Error('Add a button before setting its style');
    delete this.#lastButton.style;
    return this;
  }

  build() {
    return this.#rows
      .filter((row) => row.length > 0)
      .map((row) => row.map((button) => ({ ...button })));
  }

  buildMarkup() {
    return {
      Inline: this.build().map((row) => row.map((button) => {
        const result = { Text: button.text };
        if (button.data !== undefined) result.Data = button.data;
        if (button.url !== undefined) result.Url = button.url;
        if (button.app !== undefined) result.App = button.app;
        if (button.copy !== undefined) result.Copy = button.copy;
        if (button.command !== undefined) result.Command = button.command;
        if (button.style !== undefined) result.Style = button.style;
        return result;
      })),
    };
  }
}