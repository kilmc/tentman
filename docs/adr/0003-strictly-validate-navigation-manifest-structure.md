# Strictly validate navigation manifest structure

`@tentman/core` will strictly validate the navigation manifest structure it owns while continuing to accept shorthand string navigation references as input. This trades the runtime module's previous tolerance for consistent early failures across CLI, runtime, and web, with compatibility limited to manifest shapes Tentman intentionally supports.
