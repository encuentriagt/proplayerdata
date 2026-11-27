/// Saca `data` de `{data, meta}`.
Object? apiData(Object? body) => body is Map ? body['data'] : null;

/// `data` como lista de objetos (vacía si no viene).
List<Map<String, dynamic>> apiList(Object? body) {
  final data = apiData(body);
  if (data is! List) return const [];
  return data
      .whereType<Map>()
      .map((e) => Map<String, dynamic>.from(e))
      .toList();
}

/// `data` como objeto (vacío si no viene).
Map<String, dynamic> apiMap(Object? body) {
  final data = apiData(body);
  if (data is Map) return Map<String, dynamic>.from(data);
  return body is Map ? Map<String, dynamic>.from(body) : <String, dynamic>{};
}
