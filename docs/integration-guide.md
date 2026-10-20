# 連携ガイド

ローカル起動後、`Authorization: Bearer mock-user-001` を付けて `http://localhost:3000/api/v1/me` を呼び出します。利用できるモックトークンは `mock-user-001`、`mock-user-002`、`mock-user-003` です。

StudyContext は `trainingId` と `assignmentId` をクエリで指定します。`mode` や `stage` はクライアントから受け取らず、サーバー側のコンテキストを返します。