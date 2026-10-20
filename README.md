# MBA Full Cycle - Domain Driven Design: Lista de Espera de Ingressos

Este repositório contém a implementação da feature **Lista de Espera de Ingressos**, desenvolvida para desacoplar agregados através de eventos de domínio, políticas e eventos de integração no ecossistema de venda de ingressos do MBA Full Cycle.

---

## 🚀 Como Executar o Projeto

### Pré-requisitos
- Node.js 18+
- Docker & Docker Compose

### 1. Subir a Infraestrutura
Inicie os serviços auxiliares (MySQL 8, Redis e RabbitMQ):
```bash
docker-compose up -d
```

### 2. Instalar Dependências
```bash
npm install
```

### 3. Preparar o Banco de Dados
O projeto utiliza o MikroORM com mapeamento livre de decorators no domínio (`EntitySchema`). Para inicializar todas as tabelas (incluindo `stored_event` e as tabelas da lista de espera `waiting_lists` e `waiting_list_entries`):
```bash
npx mikro-orm schema:fresh --run
```

> **Atenção:** Os testes de infraestrutura e repositório recriam o schema no banco temporariamente sem registrar o `StoredEventSchema`. Se você rodar a suíte de testes (`npm test`), execute novamente `npx mikro-orm schema:fresh --run` antes de subir as aplicações da API para garantir que a tabela `stored_event` esteja presente.

### 4. Iniciar as Aplicações
Em terminais separados:

**API Principal (porta 3000):**
```bash
npm run start:dev
```

**Microsserviço de E-mails / Consumidor RabbitMQ (porta 3001):**
```bash
npx nest start emails
```

---

## 🧪 Como Rodar os Testes

Execute a suíte completa de testes (testes unitários de domínio puro, testes de repositório com MySQL real e teste de fluxo de ponta a ponta):
```bash
npm test
```

Para rodar apenas o teste de ponta a ponta do cancelamento e reação:
```bash
npx jest cancel-order-flow.spec.ts
```

---

## 🏛️ Justificativa da Fronteira do Agregado `WaitingList`

À luz dos princípios de Domain-Driven Design e das regras de modelagem de agregados (Vaughn Vernon e Eric Evans), um agregado deve ser desenhado tão pequeno quanto possível para garantir a consistência transacional de suas invariantes diretas. O agregado `Event` tem a responsabilidade de gerenciar a estrutura do evento (seções e lugares) e o ciclo de reserva/disponibilização de assentos. Por outro lado, a `WaitingList` possui uma razão de mudança, ciclo de vida e volume de mutação completamente distintos: dezenas ou centenas de clientes podem entrar ou sair da fila de espera em alta frequência quando uma seção esgota. Se a `WaitingList` estivesse aninhada dentro de `Event`, qualquer entrada de cliente na fila exigiria bloquear e persistir o agregado `Event` inteiro (com todas as suas seções e milhares de lugares), gerando contenção severa de locks e inviabilizando compras e consultas simultâneas. Além disso, a lista de espera é uma preocupação transitória associada apenas aos identificadores da seção e do evento (`event_id` e `section_id`). Manter `WaitingList` como um agregado independente, referenciando `Event` exclusivamente por identidade e comunicando-se por meio de eventos de domínio e políticas, preserva alta coesão, escalabilidade e desacoplamento.

---

## 🔄 Cadeia Completa do Cancelamento de Pedido

O fluxo de cancelamento opera integralmente de forma reativa e desacoplada, cumprindo a seguinte cadeia:

1. **Comando REST:** O cliente dispara `POST /events/:event_id/orders/:order_id/cancel`, interceptado por `OrdersController.cancel`, que delega para `OrderService.cancel(order_id)`.
2. **Invariante no Agregado `Order`:** `Order.cancel()` valida se o pedido já foi cancelado (lançando `Order already cancelled`), atualiza o status para `CANCELLED` e registra o evento de domínio `OrderCancelled`, enriquecido com o `event_spot_id`.
3. **ApplicationService:** A execução ocorre dentro de `ApplicationService.run(...)`. O pedido cancelado é salvo no repositório, o Unit of Work comita a transação e o `DomainEventManager` publica o evento de domínio (gravando-o no `stored_event`).
4. **1ª Reação (`OrderCancelledHandler`):** Reagindo a `OrderCancelled`, o handler consulta `IEventRepository.findBySpotId(event_spot_id)` para localizar o `Event`. O `Event` invoca `markSpotAsAvailable(spot_id)`, que desce a cadeia até `EventSpot.markAsAvailable()`, redefinindo `is_reserved = false` e registrando no agregado o evento de domínio `EventSpotReleased`. Em seguida, o handler remove a trava `SpotReservation` via `ISpotReservationRepository.delete()`, persiste o evento e publica seus eventos de domínio através do `DomainEventManager`.
5. **2ª Reação e Política (`EventSpotReleasedHandler`):** Reagindo a `EventSpotReleased`, o handler busca a fila de espera daquela seção via `IWaitingListRepository.findByEventAndSectionId(event_id, section_id)`. Se houver fila com entradas pendentes, a política de promoção é acionada: `waitingList.promoteFirstPending(spot_id)` promove a primeira entrada `PENDING` para `NOTIFIED` (respeitando a ordem de chegada) e registra no agregado o evento de domínio `SpotOfferedToWaitingCustomer`. O handler salva a lista de espera e publica via `DomainEventManager` tanto o evento de domínio quanto o evento de integração `SpotOfferedToWaitingCustomerIntegrationEvent`.
6. **Fila Bull & RabbitMQ:** O `SpotOfferedToWaitingCustomerIntegrationEvent` é enfileirado na fila Bull (`integration-events`) via Redis, sendo processado pelo `IntegrationEventsPublisher`, que o despacha para o RabbitMQ na exchange `amq.direct` com routing key correspondente ao nome do evento.
7. **Consumo no Apps/Emails:** O microsserviço `apps/emails` escuta a exchange via `@RabbitSubscribe` em `ConsumerService.handleSpotOffered(...)` e registra um log estruturado comprovando a notificação daquele cliente com a oportunidade de adquirir o assento liberado.

---

## 📚 Artefatos de Design Estratégico

- **Event Storming:** [docs/event-storming.excalidraw](file:///docs/event-storming.excalidraw) (contém Comandos, Agregados, Eventos de Domínio, Políticas, Eventos de Integração e Consumidores externos).
- **Glossário de Linguagem Ubíqua:** [docs/linguagem-ubiqua.md](file:///docs/linguagem-ubiqua.md) (definições formais de 10 termos centrais do domínio da feature).
- **Roteiro de Requisições HTTP:** [api.http](file:///api.http) (cenário completo para validação manual dos fluxos de criação de parceiro, cliente A e B, evento, seção, publicação, compra esgotando a seção, entrada na lista de espera e cancelamento provocando a liberação e notificação).

---

## 📋 Roteiro de Validação Manual

1. Execute `docker-compose up -d` e garanta que MySQL, Redis e RabbitMQ estejam ativos.
2. Prepare o banco: `npx mikro-orm schema:fresh --run`.
3. Inicie a API principal (`npm run start:dev`) e o app de e-mails (`npx nest start emails`).
4. Abra o arquivo [api.http](file:///api.http) e execute em sequência:
   - Criar parceiro
   - Criar cliente A e cliente B
   - Criar evento e criar seção com `total_spots: 1`
   - Publicar evento e seção (`publish-all`)
   - Cliente A compra o único lugar (seção esgota)
   - Cliente B entra na lista de espera (`POST .../waiting-list`) e consulta a fila (`GET .../waiting-list`): status `PENDING`
   - Cancelar o pedido do cliente A (`POST .../orders/:id/cancel`)
5. Observe os 5 efeitos colaterais imediatos:
   - O lugar volta a ficar disponível no `GET` de spots (`is_reserved: false`).
   - A consulta da fila mostra a entrada do cliente B como `NOTIFIED`.
   - O terminal do `apps/emails` exibe o log estruturado do evento `SpotOfferedToWaitingCustomerIntegrationEvent`.
   - A trava `SpotReservation` foi excluída do banco de dados.
   - A tabela `stored_event` registra todos os eventos de domínio: `CustomerJoinedWaitingList`, `OrderCancelled`, `EventSpotReleased` e `SpotOfferedToWaitingCustomer`.
