(function () {
    function normalize(value) {
        return String(value || '').toLocaleLowerCase('fr-FR');
    }

    function compareValues(a, b, type) {
        if (type === 'number') {
            return (Number(a) || 0) - (Number(b) || 0);
        }

        return normalize(a).localeCompare(normalize(b), 'fr-FR', {
            numeric: true,
            sensitivity: 'base'
        });
    }

    window.initTableTools = function initTableTools(options) {
        const tbody = document.querySelector(options.tbody);
        const searchInput = document.querySelector(options.search);
        const sortSelect = document.querySelector(options.sort);

        if (!tbody) {
            return;
        }

        const rows = [...tbody.querySelectorAll(options.rowSelector || 'tr')];
        rows.forEach((row, index) => {
            row.dataset.initialOrder = String(index);
        });

        function apply() {
            const query = normalize(searchInput?.value);
            const [key, direction = 'asc', type = 'text'] = (sortSelect?.value || 'manual:asc:number').split(':');

            rows.forEach(row => {
                const matches = !query || normalize(row.dataset.search).includes(query);
                row.hidden = !matches;
            });

            const sortedRows = [...rows].sort((a, b) => {
                if (key === 'manual') {
                    return Number(a.dataset.initialOrder) - Number(b.dataset.initialOrder);
                }

                const result = compareValues(a.dataset[key], b.dataset[key], type);
                return direction === 'desc' ? -result : result;
            });

            sortedRows.forEach(row => tbody.appendChild(row));
        }

        searchInput?.addEventListener('input', apply);
        sortSelect?.addEventListener('change', apply);
        apply();
    };
}());
