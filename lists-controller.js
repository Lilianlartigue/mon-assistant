/* Contrôleur indépendant pour Tâches, Courses et Lycée */
(function () {
  window.__LIST_CONTROLLER_ACTIVE = true;

  function ensureArray(name) {
    if (!Array.isArray(data[name])) data[name] = [];
    return data[name];
  }

  function formValues(form) {
    return Object.fromEntries(
      new FormData(form).entries()
    );
  }

  function saveTaskForm() {
    const form = document.getElementById('task-form');
    if (!form) return showToast('Le formulaire Tâches est introuvable.');
    if (!form.reportValidity()) return;

    const values = formValues(form);
    const title = String(values.title || '').trim();

    if (!title) return showToast('Indique un nom pour la tâche.');

    const list = ensureArray('tasks');
    let item = values.id
      ? list.find(function (row) { return row.id === values.id; })
      : null;

    if (item) {
      item.title = title;
      item.priority = values.priority || 'Normale';
      item.due = values.due || '';
    } else {
      item = {
        id: id('task'),
        title: title,
        priority: values.priority || 'Normale',
        due: values.due || '',
        done: false
      };
      list.unshift(item);
    }

    ui.taskEditing = null;
    save();
    render();

    Promise.resolve(syncListItem('tasks', item))
      .catch(function () {});

    showToast('Tâche enregistrée.');
  }

  function saveShoppingForm() {
    const form = document.getElementById('shopping-form');
    if (!form) return showToast('Le formulaire Courses est introuvable.');
    if (!form.reportValidity()) return;

    const values = formValues(form);
    const name = String(values.name || '').trim();

    if (!name) return showToast('Indique un produit.');

    const list = ensureArray('shopping');
    let item = values.id
      ? list.find(function (row) { return row.id === values.id; })
      : null;

    if (item) {
      item.name = name;
      item.quantity = String(values.quantity || '1').trim() || '1';
      item.category = values.category || 'Autre';
      item.priority = values.priority || 'Normale';
    } else {
      item = {
        id: id('shopping'),
        name: name,
        quantity: String(values.quantity || '1').trim() || '1',
        category: values.category || 'Autre',
        priority: values.priority || 'Normale',
        done: false
      };
      list.unshift(item);
    }

    ui.shoppingEditing = null;
    save();
    render();

    Promise.resolve(syncListItem('shopping', item))
      .catch(function () {});

    showToast('Article enregistré.');
  }

  function saveLyceeForm() {
    const form = document.getElementById('lycee-form');
    if (!form) return showToast('Le formulaire Lycée est introuvable.');
    if (!form.reportValidity()) return;

    const values = formValues(form);
    const title = String(values.title || '').trim();

    if (!title) return showToast('Indique un titre.');

    const list = ensureArray('lycee');
    let item = values.id
      ? list.find(function (row) { return row.id === values.id; })
      : null;

    if (item) {
      item.title = title;
      item.details = String(values.details || '').trim();
      item.priority = values.priority || 'Normale';
    } else {
      item = {
        id: id('lycee'),
        title: title,
        details: String(values.details || '').trim(),
        priority: values.priority || 'Normale',
        done: false
      };
      list.unshift(item);
    }

    ui.lyceeEditing = null;
    save();
    render();
    showToast('Élément Lycée enregistré.');
  }

  function removeLocal(listName, itemId) {
    const list = ensureArray(listName);
    const item = list.find(function (row) { return row.id === itemId; });

    data[listName] = list.filter(function (row) {
      return row.id !== itemId;
    });

    save();
    render();

    if (listName === 'tasks' || listName === 'shopping') {
      deleteRemoteListItem(listName, item);
    }
  }

  function focusForm(page, formSelector, fieldSelector) {
    if (pageId() !== page) {
      goTo(page);
    } else {
      render();
    }

    setTimeout(function () {
      const form = document.querySelector(formSelector);
      const field = document.querySelector(fieldSelector);
      if (form) {
        form.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
      if (field) field.focus();
    }, 20);
  }

  function handleAction(button) {
    const action = button.dataset.action;
    const itemId = button.dataset.id;

    if (action === 'save-task-form') {
      saveTaskForm();
      return true;
    }

    if (action === 'save-shopping-form') {
      saveShoppingForm();
      return true;
    }

    if (action === 'save-lycee-form') {
      saveLyceeForm();
      return true;
    }

    if (action === 'focus-task') {
      ui.taskEditing = null;
      focusForm('tasks', '#task-form', '#task-title');
      return true;
    }

    if (action === 'focus-shopping') {
      ui.shoppingEditing = null;
      focusForm('shopping', '#shopping-form', '#shopping-name');
      return true;
    }

    if (action === 'focus-lycee') {
      ui.lyceeEditing = null;
      focusForm('lycee', '#lycee-form', '#lycee-title');
      return true;
    }

    if (action === 'toggle-task') {
      const item = ensureArray('tasks').find(function (row) {
        return row.id === itemId;
      });
      if (item) {
        item.done = !item.done;
        save();
        render();
        Promise.resolve(syncListItem('tasks', item)).catch(function () {});
      }
      return true;
    }

    if (action === 'toggle-shopping') {
      const item = ensureArray('shopping').find(function (row) {
        return row.id === itemId;
      });
      if (item) {
        item.done = !item.done;
        save();
        render();
        Promise.resolve(syncListItem('shopping', item)).catch(function () {});
      }
      return true;
    }

    if (action === 'toggle-lycee') {
      const item = ensureArray('lycee').find(function (row) {
        return row.id === itemId;
      });
      if (item) {
        item.done = !item.done;
        save();
        render();
      }
      return true;
    }

    if (action === 'edit-task') {
      ui.taskEditing = itemId;
      render();
      setTimeout(function () {
        document.getElementById('task-title')?.focus();
      }, 0);
      return true;
    }

    if (action === 'edit-shopping') {
      ui.shoppingEditing = itemId;
      render();
      setTimeout(function () {
        document.getElementById('shopping-name')?.focus();
      }, 0);
      return true;
    }

    if (action === 'edit-lycee') {
      ui.lyceeEditing = itemId;
      render();
      setTimeout(function () {
        document.getElementById('lycee-title')?.focus();
      }, 0);
      return true;
    }

    if (action === 'delete-task') {
      removeLocal('tasks', itemId);
      showToast('Tâche supprimée.');
      return true;
    }

    if (action === 'delete-shopping') {
      removeLocal('shopping', itemId);
      showToast('Article supprimé.');
      return true;
    }

    if (action === 'delete-lycee') {
      removeLocal('lycee', itemId);
      showToast('Élément Lycée supprimé.');
      return true;
    }

    if (action === 'cancel-task') {
      ui.taskEditing = null;
      render();
      return true;
    }

    if (action === 'cancel-shopping') {
      ui.shoppingEditing = null;
      render();
      return true;
    }

    if (action === 'cancel-lycee') {
      ui.lyceeEditing = null;
      render();
      return true;
    }

    if (action === 'task-filter') {
      ui.taskFilter = button.dataset.filter || 'Toutes';
      render();
      return true;
    }

    if (action === 'shopping-filter') {
      ui.shoppingFilter = button.dataset.filter || 'Toutes';
      render();
      return true;
    }

    return false;
  }

  document.addEventListener(
    'click',
    function (event) {
      const button = event.target.closest('[data-action]');
      if (!button) return;

      if (!handleAction(button)) return;

      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true
  );

  document.addEventListener(
    'submit',
    function (event) {
      const form = event.target;

      if (!(form instanceof HTMLFormElement)) return;

      if (form.id === 'task-form') {
        event.preventDefault();
        event.stopImmediatePropagation();
        saveTaskForm();
        return;
      }

      if (form.id === 'shopping-form') {
        event.preventDefault();
        event.stopImmediatePropagation();
        saveShoppingForm();
        return;
      }

      if (form.id === 'lycee-form') {
        event.preventDefault();
        event.stopImmediatePropagation();
        saveLyceeForm();
      }
    },
    true
  );
})();
